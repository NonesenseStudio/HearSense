import { describe, expect, it } from "vitest";
import { evaluateReview } from "../shared/domain/review";
import { reviewSubmissionSchema } from "../shared/schemas/vocabulary";
import type { ReviewEvidence, WordRecord } from "../shared/types/vocabulary";

function word(state: WordRecord["state"] = "L2"): WordRecord {
  return {
    id: "8fb5217b-eab4-464b-9b26-ccb97f6cf0c3",
    word: "astonish",
    wordDisplay: "astonish",
    pronunciation: null,
    audioUrl: null,
    state,
    container: state === "L3" || state === "L4" ? "graduated" : "active_review",
    source: "movie",
    sourceContext: null,
    encounterCount: 3,
    lastEncounterAt: null,
    audioFamiliarity: "high",
    personalRelevance: "medium",
    learnerReport: null,
    activeUsageVerified: state === "L4",
    lastResult: null,
    retrievalLatencyMs: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}
function submission(overrides: Record<string, unknown> = {}) {
  return reviewSubmissionSchema.parse({
    wordId: "8fb5217b-eab4-464b-9b26-ccb97f6cf0c3",
    testMode: "audio",
    learnerResponse: "使人惊讶",
    selfAssessment: "INSTANT",
    latencyMs: 1200,
    answerRevealed: false,
    occurredAt: "2026-09-02T10:00:00.000Z",
    ...overrides,
  });
}
function evidence(overrides: Partial<ReviewEvidence> = {}): ReviewEvidence {
  return {
    testMode: "audio",
    result: "INSTANT",
    contaminated: false,
    isNaturalReencounter: false,
    occurredAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("review evaluator", () => {
  it("does not graduate on one audio success", () => {
    expect(evaluateReview(word("L1"), submission(), [])).toMatchObject({
      stateAfter: "L2",
      graduated: false,
    });
  });

  it("graduates with two instant audio results in the latest three and no recent failure", () => {
    expect(
      evaluateReview(word("L2"), submission(), [evidence()]),
    ).toMatchObject({
      stateAfter: "L3",
      containerAfter: "graduated",
      graduated: true,
    });
  });

  it("does not graduate from written-only evidence", () => {
    const result = evaluateReview(
      word("L2"),
      submission({ testMode: "written" }),
      [evidence({ testMode: "written" })],
    );
    expect(result).toMatchObject({ stateAfter: "L2", graduated: false });
  });

  it("records revealed-first attempts as contaminated without changing state", () => {
    const result = evaluateReview(
      word("L2"),
      submission({ answerRevealed: true }),
      [evidence()],
    );
    expect(result).toMatchObject({
      contaminated: true,
      stateAfter: "L2",
      graduated: false,
      nextAction: "record_exposure_only",
    });
  });

  it("downgrades a claimed instant result when measured latency exceeds two seconds", () => {
    expect(
      evaluateReview(word("L1"), submission({ latencyMs: 2501 }), []),
    ).toMatchObject({ result: "SLOW", stateAfter: "L2" });
  });

  it("re-enters a graduated word after a meaningful audio failure using neutral feedback", () => {
    const result = evaluateReview(
      word("L3"),
      submission({ selfAssessment: "FAIL", learnerResponse: "" }),
      [],
    );
    expect(result).toMatchObject({
      stateAfter: "L2",
      reentered: true,
      containerAfter: "active_review",
    });
    expect(result.feedback).toContain("不是惩罚");
  });

  it("sets L4 only from explicit production evidence", () => {
    expect(
      evaluateReview(word("L3"), submission({ testMode: "production" }), []),
    ).toMatchObject({ stateAfter: "L4", activeUsageVerified: true });
  });
});
