import { describe, expect, it } from "vitest";
import {
  allocateSessionMinutes,
  generateSessionPlan,
  newWordAllowance,
} from "../shared/domain/planner";
import type { ReviewResult, WordRecord } from "../shared/types/vocabulary";

function word(id: string, lastResult: ReviewResult | null = null): WordRecord {
  return {
    id,
    word: id,
    wordDisplay: id,
    pronunciation: null,
    audioUrl: null,
    state: "L2",
    container: "active_review",
    source: null,
    sourceContext: null,
    encounterCount: 1,
    lastEncounterAt: null,
    audioFamiliarity: "unknown",
    personalRelevance: "unknown",
    learnerReport: null,
    activeUsageVerified: false,
    lastResult,
    retrievalLatencyMs: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

describe("daily session planner", () => {
  it.each([
    [7, 5],
    [8, 3],
    [11, 3],
    [12, 2],
    [15, 2],
    [16, 0],
  ])("maps active count %i to allowance %i", (count, allowance) => {
    expect(newWordAllowance(count)).toBe(allowance);
  });

  it("uses 3/7/6/4 minutes for a standard session", () => {
    expect(allocateSessionMinutes(20)).toEqual([3, 7, 6, 4]);
  });

  it("scales a shorter session without extending it", () => {
    const phases = allocateSessionMinutes(10);
    expect(phases).toEqual([1.5, 3.5, 3, 2]);
    expect(phases.reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("prioritizes FAIL, VAGUE and SLOW and treats the new limit as a ceiling", () => {
    const active = [
      word("instant", "INSTANT"),
      word("slow", "SLOW"),
      word("fail", "FAIL"),
      word("vague", "VAGUE"),
    ];
    const candidates = [{ word: word("candidate"), priority: 80 }];
    const plan = generateSessionPlan({
      activeWords: active,
      candidateWords: candidates,
      today: "2026-09-02",
    });
    expect(plan.session[0]?.wordIds.slice(0, 3)).toEqual([
      "fail",
      "vague",
      "slow",
    ]);
    expect(plan.newWordLimit).toBe(5);
    expect(plan.newWordIds).toEqual(["candidate"]);
  });

  it("adds no compensation signal and blocks new words over 15", () => {
    const plan = generateSessionPlan({
      activeWords: Array.from({ length: 16 }, (_, index) =>
        word(String(index)),
      ),
      candidateWords: [{ word: word("new"), priority: 100 }],
      today: "2026-09-02",
    });
    expect(plan).toMatchObject({
      newWordLimit: 0,
      newWordIds: [],
      debtStatus: "blocked",
      durationMinutes: 20,
    });
  });
});
