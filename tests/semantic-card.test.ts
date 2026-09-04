import { describe, expect, it } from "vitest";
import {
  applySemanticSense,
  buildSemanticCardDraft,
} from "../shared/domain/semantic-card";

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
    expect(result.semanticScene).toContain("非常惊讶");
    expect(result.coreMeaningEn).toBe("to surprise someone greatly");
    expect(result.exampleOrigin).toBe("learner_source");
    expect(result.senseOptions).toHaveLength(2);
    expect(applySemanticSense(result, 1).coreMeaningEn).toBe("another sense");
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
