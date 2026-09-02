import { describe, expect, it } from "vitest";
import { analyzeVocabulary } from "../shared/domain/analytics";
import type { AnalyticsDataset } from "../shared/types/analytics";

function dataset(overrides: Partial<AnalyticsDataset> = {}): AnalyticsDataset {
  return {
    period: { start: "2026-08-01", end: "2026-08-31" },
    activatedWordIds: ["w1", "w2"],
    graduatedWordIds: ["w1"],
    stateDistribution: { L0: 1, L1: 1, L2: 2, L3: 1, L4: 0 },
    reviewEvents: [
      {
        wordId: "w1",
        testMode: "audio",
        result: "INSTANT",
        latencyMs: 1000,
        contaminated: false,
        isNaturalReencounter: false,
        reentered: false,
        occurredAt: "2026-08-02T00:00:00Z",
      },
      {
        wordId: "w2",
        testMode: "audio",
        result: "SLOW",
        latencyMs: 3000,
        contaminated: false,
        isNaturalReencounter: false,
        reentered: false,
        occurredAt: "2026-08-03T00:00:00Z",
      },
      {
        wordId: "w2",
        testMode: "written",
        result: "FAIL",
        latencyMs: 4000,
        contaminated: false,
        isNaturalReencounter: false,
        reentered: true,
        occurredAt: "2026-08-04T00:00:00Z",
      },
      {
        wordId: "w2",
        testMode: "audio",
        result: "INSTANT",
        latencyMs: 500,
        contaminated: true,
        isNaturalReencounter: false,
        reentered: false,
        occurredAt: "2026-08-05T00:00:00Z",
      },
    ],
    naturalReencounters: [
      { understood: true, occurredAt: "2026-08-06T00:00:00Z" },
      { understood: false, occurredAt: "2026-08-07T00:00:00Z" },
    ],
    poolSnapshots: [
      { date: "2026-08-01", count: 10 },
      { date: "2026-08-31", count: 16 },
    ],
    ...overrides,
  };
}

describe("vocabulary analyst", () => {
  it("calculates metrics from distinct, valid evidence populations", () => {
    const result = analyzeVocabulary(dataset());
    expect(result.metrics).toMatchObject({
      conversionRate: 0.5,
      reviewPoolStability: 0.5,
      auditoryRetrievalRate: 0.5,
      medianRetrievalLatencyMs: 2000,
      naturalReencounterSuccess: 0.5,
      reenteredWords: 1,
      activePoolTrend: { first: 10, last: 16, direction: "up" },
    });
    expect(result.sample).toMatchObject({
      audioTests: 2,
      deliberateReviews: 3,
      naturalReencounters: 2,
      observedDays: 2,
    });
    expect(result.confidence).toBe("low");
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it("returns null rather than guessing when denominators are zero", () => {
    const result = analyzeVocabulary(
      dataset({
        activatedWordIds: [],
        graduatedWordIds: [],
        reviewEvents: [],
        naturalReencounters: [],
        poolSnapshots: [],
      }),
    );
    expect(result.metrics).toMatchObject({
      conversionRate: null,
      reviewPoolStability: null,
      auditoryRetrievalRate: null,
      medianRetrievalLatencyMs: null,
      naturalReencounterSuccess: null,
      activePoolTrend: null,
      resultShares: { fail: null, vague: null, slow: null },
    });
  });

  it("excludes missing timestamps and reports the limitation", () => {
    const result = analyzeVocabulary(
      dataset({
        reviewEvents: [
          {
            wordId: "w1",
            testMode: "audio",
            result: "INSTANT",
            latencyMs: 1000,
            contaminated: false,
            isNaturalReencounter: false,
            reentered: false,
            occurredAt: null,
          },
        ],
      }),
    );
    expect(result.sample.audioTests).toBe(0);
    expect(
      result.dataQualityNotes.some((note) => note.includes("缺少时间戳")),
    ).toBe(true);
  });
});
