import { describe, expect, it } from "vitest";
import { evaluateIntake } from "../shared/domain/intake";
import { intakeInputSchema } from "../shared/schemas/vocabulary";

function intake(overrides: Record<string, unknown> = {}) {
  return intakeInputSchema.parse({
    word: "astonish",
    meaningRecall: "none",
    ...overrides,
  });
}

describe("word intake rules", () => {
  it("keeps a completely unfamiliar word at L0 in the candidate inbox", () => {
    const result = evaluateIntake(
      intake({ heardBefore: false, seenBefore: false }),
      { activeReviewCount: 0 },
    );
    expect(result).toMatchObject({
      classification: "L0",
      container: "candidate_inbox",
      admit: false,
    });
  });

  it("admits a repeated ear-familiar L1 word when debt is controlled", () => {
    const result = evaluateIntake(
      intake({
        heardBefore: true,
        audioFamiliarity: "high",
        encounterCount: 3,
      }),
      { activeReviewCount: 8 },
    );
    expect(result).toMatchObject({
      classification: "L1",
      container: "active_review",
      admit: true,
      activationBlockedByDebt: false,
    });
  });

  it("blocks activation above 15 without changing the familiarity classification", () => {
    const result = evaluateIntake(
      intake({
        heardBefore: true,
        audioFamiliarity: "high",
        encounterCount: 3,
      }),
      { activeReviewCount: 16 },
    );
    expect(result).toMatchObject({
      classification: "L1",
      container: "candidate_inbox",
      admit: false,
      activationBlockedByDebt: true,
    });
  });

  it("asks exactly one focused question when familiarity evidence is ambiguous", () => {
    const result = evaluateIntake(intake({ meaningRecall: "unknown" }), {
      activeReviewCount: 2,
    });
    expect(result.needsClarification).toBe(true);
    expect(result.clarifyingQuestion).toContain("只听到这个词");
  });

  it("never overwrites the state of an existing word during intake", () => {
    const result = evaluateIntake(intake({ meaningRecall: "instant" }), {
      activeReviewCount: 5,
      currentState: "L2",
      currentContainer: "active_review",
    });
    expect(result).toMatchObject({
      classification: "L2",
      container: "active_review",
      nextSkill: "review-evaluator",
    });
  });
});
