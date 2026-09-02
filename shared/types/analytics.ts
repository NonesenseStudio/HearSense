import type { LearningState, ReviewResult, TestMode } from "./vocabulary";

export interface AnalyticsReviewRow {
  wordId: string;
  testMode: TestMode;
  result: ReviewResult;
  latencyMs: number | null;
  contaminated: boolean;
  isNaturalReencounter: boolean;
  reentered: boolean;
  occurredAt: string | null;
}

export interface AnalyticsDataset {
  period: { start: string; end: string };
  activatedWordIds: string[];
  graduatedWordIds: string[];
  stateDistribution: Record<LearningState, number>;
  reviewEvents: AnalyticsReviewRow[];
  naturalReencounters: Array<{
    understood: boolean;
    occurredAt: string | null;
  }>;
  poolSnapshots: Array<{ date: string | null; count: number }>;
}

export interface VocabularyAnalysis {
  period: { start: string; end: string };
  sample: {
    activatedWords: number;
    audioTests: number;
    deliberateReviews: number;
    naturalReencounters: number;
    observedDays: number;
  };
  stateDistribution: Record<LearningState, number>;
  metrics: {
    conversionRate: number | null;
    reviewPoolStability: number | null;
    auditoryRetrievalRate: number | null;
    medianRetrievalLatencyMs: number | null;
    naturalReencounterSuccess: number | null;
    activePoolTrend: {
      first: number;
      last: number;
      direction: "up" | "down" | "flat";
    } | null;
    resultShares: {
      fail: number | null;
      vague: number | null;
      slow: number | null;
    };
    reenteredWords: number;
  };
  poolSeries: Array<{ date: string; count: number }>;
  confidence: "low" | "adequate" | "high";
  findings: Array<{ finding: string; evidence: string[] }>;
  recommendations: Array<{ priority: number; action: string; lever: string }>;
  dataQualityNotes: string[];
}
