import { describe, expect, it, vi } from "vitest";
import type { HttpResult, ProviderJsonClient } from "./http";
import { buildVisionPrompt, healthVision, parseVisionAnswer, type VisionInput } from "./health-ai-vision";

const INPUT: VisionInput = {
  photos: [new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1])],
  symptoms: ["잎 갈변"],
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

const options = { baseUrl: "https://ai.example/v1", key: "secret", model: "model-x" };

describe("photo AI reading (ADR-0006 D6)", () => {
  it("asks only for possibilities, never certainty or treatment, and empty answers when unsure", () => {
    const prompt = buildVisionPrompt();
    expect(prompt).toContain("Every cause is only a possibility");
    expect(prompt).toContain("Never suggest pesticides, fungicides, chemicals");
    expect(prompt).toContain("return empty arrays. Do not guess.");
  });

  it("keeps checked signs and at most 3 causes; drops risky or certain texts", () => {
    const body = JSON.parse(
      (
        chat({
          signs: ["잎 끝이 갈색으로 말라 있음", "살균제가 필요해 보임"],
          causes: [
            { name: "과습", reason: "흙이 젖어 보이고 아래 잎이 처져 있습니다." },
            { name: "건조", reason: "잎 끝이 바삭해 보입니다." },
            { name: "잿빛곰팡이병", reason: "확실히 곰팡이병입니다." },
            { name: "빛 부족", reason: "잎 색이 옅습니다." },
            { name: "추위", reason: "잎이 물러 보입니다." },
          ],
          checks: ["흙 속 습도 확인"],
          actions: ["농약을 1000배 희석해 뿌리기", "통풍이 되는 곳으로 옮기기"],
        }) as { body: string }
      ).body,
    );
    expect(parseVisionAnswer(body, "model-x")).toEqual({
      signs: ["잎 끝이 갈색으로 말라 있음"],
      causes: [
        { name: "과습", reason: "흙이 젖어 보이고 아래 잎이 처져 있습니다." },
        { name: "건조", reason: "잎 끝이 바삭해 보입니다." },
        { name: "빛 부족", reason: "잎 색이 옅습니다." },
      ],
      checks: ["흙 속 습도 확인"],
      actions: ["통풍이 되는 곳으로 옮기기"],
      model: "model-x",
    });
  });

  it("sends the cleaned photos as JPEG data, with symptoms, time and species only", async () => {
    const client = answering(chat({ signs: ["잎 끝 갈변"], causes: [], checks: [], actions: [] }));
    expect((await healthVision(client, options).judge(INPUT)).kind).toBe("ok");
    const [url, body, headers, operation] = client.postJson.mock.calls[0];
    expect(url).toBe("https://ai.example/v1/chat/completions");
    expect(headers).toEqual({ authorization: "Bearer secret" });
    expect(operation).toBe("health_vision");
    const content = (body as { messages: { content: unknown }[] }).messages[1].content as {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
    expect(JSON.parse(content[0].text!)).toEqual({ plant: "Ficus elastica", symptoms: ["잎 갈변"], noticed: "이번 주" });
    expect(content[1].image_url?.url).toBe(`data:image/jpeg;base64,${Buffer.from(INPUT.photos[0]).toString("base64")}`);
    expect(content).toHaveLength(2);
  });

  it("answers none when nothing safe is left, unavailable on a broken body or error, quota at the limit", async () => {
    const judge = (result: HttpResult) => healthVision(answering(result), options).judge(INPUT);
    expect(await judge(chat({ signs: [], causes: [], checks: [], actions: [] }))).toEqual({ kind: "none" });
    expect(await judge(chat("not json"))).toEqual({ kind: "unavailable" });
    expect(await judge({ kind: "response", status: 500, headers: new Headers(), body: "" })).toEqual({ kind: "unavailable" });
    expect(await judge({ kind: "blocked", reason: "limit" })).toEqual({ kind: "quota" });
  });
});
