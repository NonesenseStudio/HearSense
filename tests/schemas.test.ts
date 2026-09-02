import { describe, expect, it } from "vitest";
import {
  intakeInputSchema,
  reviewSubmissionSchema,
  settingsInputSchema,
} from "../shared/schemas/vocabulary";

describe("shared vocabulary schemas", () => {
  it("accepts a bounded intake payload and applies unknown defaults", () => {
    const result = intakeInputSchema.parse({ word: "  Astonish  " });
    expect(result).toMatchObject({
      word: "Astonish",
      audioFamiliarity: "unknown",
      personalRelevance: "unknown",
      meaningRecall: "unknown",
    });
  });

  it("rejects unsupported enum values and non-English input", () => {
    expect(
      intakeInputSchema.safeParse({ word: "惊讶", source: "dictionary" })
        .success,
    ).toBe(false);
  });

  it("requires immutable review evidence fields", () => {
    const result = reviewSubmissionSchema.safeParse({
      wordId: "8fb5217b-eab4-464b-9b26-ccb97f6cf0c3",
      testMode: "audio",
      learnerResponse: "使人惊讶",
      selfAssessment: "INSTANT",
      answerRevealed: false,
      occurredAt: "2026-09-02T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid settings outside the bounded session", () => {
    expect(
      settingsInputSchema.safeParse({
        dailyMinutes: 30,
        autoplayAudio: true,
        audioSpeed: 1,
      }).success,
    ).toBe(false);
  });
});
