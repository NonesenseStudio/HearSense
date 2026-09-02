import { describe, expect, it } from "vitest";
import { buildSemanticCardDraft } from "../shared/domain/semantic-card";

describe("semantic card draft", () => {
  it("prefers learner context and uses only one dictionary sense", () => {
    const result = buildSemanticCardDraft({
      word: "astonish",
      source: "movie",
      sourceContext: "You never cease to astonish me.",
      dictionary: {
        headword: "astonish",
        pronunciations: [
          { ipa: "/əˈstɑːnɪʃ/", accent: "american", audioUrl: null },
        ],
        senses: [
          {
            partOfSpeech: "verb",
            definitionEn: "to surprise someone greatly",
            definitionZh: "使非常惊讶",
            example: "The result astonished us.",
          },
          {
            partOfSpeech: "verb",
            definitionEn: "another sense",
            definitionZh: "另一义项",
            example: "Unused.",
          },
        ],
      },
    });
    expect(result.anchorSentence).toBe("You never cease to astonish me.");
    expect(result.semanticScene).toBe("You never cease to astonish me.");
    expect(result.coreMeaningEn).toBe("to surprise someone greatly");
    expect(result.exampleOrigin).toBe("learner_source");
  });

  it("leaves unavailable content blank and never invents IPA", () => {
    const result = buildSemanticCardDraft({
      word: "missing",
      source: null,
      sourceContext: null,
      dictionary: null,
    });
    expect(result.pronunciation).toBeNull();
    expect(result.missingFields).toEqual([
      "coreMeaningEn",
      "coreMeaningZh",
      "anchorSentence",
      "semanticScene",
    ]);
  });
});
