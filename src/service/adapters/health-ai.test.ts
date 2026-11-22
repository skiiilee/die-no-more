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

  it("drops synonyms, household remedies, applying, more dose units and definite wording (PR #23 review)", () => {
    for (const risky of [
      "살충 스프레이로 잎을 닦아 주세요",
      "님오일을 잎에 발라 주세요",
      "베이킹 소다 물을 분무해 보세요",
      "과산화수소로 흙을 소독하기",
      "알코올 솜으로 잎 뒷면 닦기",
      "주방 세제 물로 씻어 내기",
      "계피 가루를 흙 위에 뿌려 두기",
      "식초를 1:10으로 섞어 쓰기",
      "물에 5% 정도 섞어 주기",
      "한 스푼 정도 넣기",
      "Use a fungicide spray",
      "잎 끝이 마른 것은 건조 때문입니다",
      "탄저병입니다",
      "곰팡이에 감염되었습니다",
      "분명히 과습이 원인입니다",
    ]) {
      expect(safeText(risky), risky).toBeNull();
    }
  });

  it("keeps the texts Gemini actually gave in the live check (2026-11-22)", () => {
    for (const live of [
      "잎에 생겨난 선명한 테두리의 점들이 곰팡이성 병해의 형태와 유사해 보일 수 있습니다.",
      "잎 색이 전반적으로 연해지고 탈색된 모습은 뿌리가 과도한 수분으로 인해 스트레스를 받았을 가능성을 시사합니다.",
      "화분 흙의 깊은 곳까지 손가락을 넣어 습한지 확인하기",
      "당분간 물주기 간격을 늘려 흙을 건조하게 유지하기",
      "다른 식물과의 접촉을 막기 위해 화분 격리하기",
      "잎 뒷면과 줄기 주변을 돋보기로 살펴보기",
      "곰팡이 감염 가능성",
    ]) {
      expect(safeText(live), live).toBe(live);
    }
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
