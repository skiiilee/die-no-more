import { describe, expect, it, vi } from "vitest";
import type { HttpResult, ProviderJsonClient } from "./http";
import { buildHealthPrompt, healthAi, parseHealthAnswer, safeText, type HealthAiInput } from "./health-ai";

const INPUT: HealthAiInput = {
  candidates: [
    { code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 },
    { code: "ERYSCI", name: "Erysiphe cichoracearum", score: 0.12 },
  ],
  symptoms: ["반점"],
  noticed: "이번 주",
  speciesName: "Ficus elastica",
};

const chat = (content: unknown): HttpResult => ({
  kind: "response",
  status: 200,
  headers: new Headers(),
  body: JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }),
});

function answering(result: HttpResult) {
  return { postJson: vi.fn<ProviderJsonClient["postJson"]>(async () => ({ attempts: 1, result })) } satisfies ProviderJsonClient;
}

describe("health AI rules (ADR-0006)", () => {
  it("tells the model to explain only the given causes, never certainly, and never a treatment", () => {
    const prompt = buildHealthPrompt();
    expect(prompt).toContain("Only explain the given codes");
    expect(prompt).toContain("Never suggest pesticides, fungicides, chemicals");
  });

  it("drops any text that names a chemical, a dose or a certain diagnosis", () => {
    expect(safeText("통풍이 잘 되는 곳으로 옮겨 며칠 지켜보기")).toBe("통풍이 잘 되는 곳으로 옮겨 며칠 지켜보기");
    for (const risky of [
      "살균제를 뿌려 주세요",
      "농약을 1000배 희석해 사용",
      "약제 처리가 필요합니다",
      "잿빛곰팡이병으로 확진됩니다",
      "물 500ml를 주세요",
      "확실히 과습입니다",
    ]) {
      expect(safeText(risky)).toBeNull();
    }
    expect(safeText("가".repeat(201))).toBeNull();
  });
});

describe("parseHealthAnswer", () => {
  it("keeps explanations only for the codes Pl@ntNet gave, and checked lists of at most 4", () => {
    const parsed = parseHealthAnswer(
      chatBody({
        causes: [
          { code: "BOTRCI", text: "습한 환경에서 생기는 곰팡이일 가능성이 있습니다." },
          { code: "MADEUP", text: "다른 원인" },
          { code: "ERYSCI", text: "살균제로 치료하세요." },
        ],
        checks: ["잎 뒷면 확인", "잎 뒷면 확인", "흙 상태 확인", "물빠짐 확인", "빛 확인", "통풍 확인"],
        actions: ["며칠 동안 같은 잎을 사진으로 비교하기", "살충제 살포"],
      }),
      ["BOTRCI", "ERYSCI"],
      "model-x",
    );
    expect(parsed).toEqual({
      causes: [{ code: "BOTRCI", text: "습한 환경에서 생기는 곰팡이일 가능성이 있습니다." }],
      checks: ["잎 뒷면 확인", "흙 상태 확인", "물빠짐 확인", "빛 확인"],
      actions: ["며칠 동안 같은 잎을 사진으로 비교하기"],
      model: "model-x",
    });
  });

  it("refuses an answer that is not a JSON object", () => {
    expect(parseHealthAnswer(chatBody("not json"), ["BOTRCI"], "m")).toBeNull();
    expect(parseHealthAnswer({}, ["BOTRCI"], "m")).toBeNull();
  });

  function chatBody(content: unknown) {
    return JSON.parse((chat(content) as { body: string }).body);
  }
});

describe("healthAi adapter", () => {
  const options = { baseUrl: "https://ai.example/v1", key: "secret", model: "model-x" };

  it("sends no photo and no free-text notes: only codes, names, symptoms, time and the species", async () => {
    const client = answering(chat({ causes: [], checks: ["흙 상태 확인"], actions: [] }));
    expect(await healthAi(client, options).explain(INPUT)).toEqual({
      kind: "ok",
      explanation: { causes: [], checks: ["흙 상태 확인"], actions: [], model: "model-x" },
    });
    const [url, body, headers, operation] = client.postJson.mock.calls[0];
    expect(url).toBe("https://ai.example/v1/chat/completions");
    expect(headers).toEqual({ authorization: "Bearer secret" });
    expect(operation).toBe("health");
    const user = JSON.parse((body as { messages: { content: string }[] }).messages[1].content);
    expect(user).toEqual({
      plant: "Ficus elastica",
      symptoms: ["반점"],
      noticed: "이번 주",
      possible_causes: [
        { code: "BOTRCI", name: "Botrytis cinerea" },
        { code: "ERYSCI", name: "Erysiphe cichoracearum" },
      ],
    });
  });

  it("answers none when every text was dropped, unavailable on a broken body or an error", async () => {
    const explain = (result: HttpResult) => healthAi(answering(result), options).explain(INPUT);
    expect(await explain(chat({ causes: [], checks: ["살균제 사용"], actions: [] }))).toEqual({ kind: "none" });
    expect(await explain(chat("```json\nnot json\n```"))).toEqual({ kind: "unavailable" });
    expect(await explain({ kind: "response", status: 500, headers: new Headers(), body: "" })).toEqual({ kind: "unavailable" });
    expect(await explain({ kind: "blocked", reason: "limit" })).toEqual({ kind: "quota" });
  });
});
