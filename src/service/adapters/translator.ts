/**
 * Translation adapter (ADR-0004). Azure Translator F0 is connected last (D4);
 * until then every request answers "unavailable" and callers use the D3
 * fallbacks: scientific name for display, no English retry for Korean search.
 */
export type TranslationAnswer = { kind: "ok"; text: string } | { kind: "unavailable" };

export type Translator = {
  koreanToEnglish(text: string): Promise<TranslationAnswer>;
};

export const notConnectedTranslator: Translator = {
  async koreanToEnglish() {
    return { kind: "unavailable" };
  },
};
