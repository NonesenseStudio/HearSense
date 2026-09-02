export const LEARNING_STATES = ["L0", "L1", "L2", "L3", "L4"] as const;
export const WORD_CONTAINERS = [
  "candidate_inbox",
  "active_review",
  "graduated",
] as const;
export const REVIEW_RESULTS = ["INSTANT", "SLOW", "VAGUE", "FAIL"] as const;
export const TEST_MODES = [
  "audio",
  "written",
  "contextual",
  "production",
] as const;
export const WORD_SOURCES = [
  "movie",
  "tv",
  "song",
  "youtube",
  "podcast",
  "game",
  "conversation",
  "book",
  "article",
  "school",
  "work",
  "other",
] as const;
export const AUDIO_FAMILIARITIES = [
  "high",
  "medium",
  "low",
  "unknown",
] as const;
export const PERSONAL_RELEVANCES = [
  "high",
  "medium",
  "low",
  "unknown",
] as const;

export type LearningState = (typeof LEARNING_STATES)[number];
export type WordContainer = (typeof WORD_CONTAINERS)[number];
export type ReviewResult = (typeof REVIEW_RESULTS)[number];
export type TestMode = (typeof TEST_MODES)[number];
export type WordSource = (typeof WORD_SOURCES)[number];
export type AudioFamiliarity = (typeof AUDIO_FAMILIARITIES)[number];
export type PersonalRelevance = (typeof PERSONAL_RELEVANCES)[number];

export interface WordRecord {
  id: string;
  word: string;
  wordDisplay: string;
  pronunciation: string | null;
  audioUrl: string | null;
  state: LearningState;
  container: WordContainer;
  source: WordSource | null;
  sourceContext: string | null;
  encounterCount: number;
  lastEncounterAt: string | null;
  audioFamiliarity: AudioFamiliarity;
  personalRelevance: PersonalRelevance;
  learnerReport: string | null;
  activeUsageVerified: boolean;
  lastResult: ReviewResult | null;
  retrievalLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticCard {
  id: string;
  wordId: string;
  senseOrder: number;
  pronunciation: string | null;
  audioUrl: string | null;
  coreMeaningEn: string;
  coreMeaningZh: string;
  anchorSentence: string;
  semanticScene: string;
  exampleOrigin: "learner_source" | "generated";
  retrievalPrompt: string;
  contextNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeDecision {
  word: string;
  wordDisplay: string;
  classification: LearningState;
  container: WordContainer;
  admit: boolean;
  priority: number | null;
  admissionReasons: string[];
  activationBlockedByDebt: boolean;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  nextSkill:
    | "semantic-card"
    | "daily-session-planner"
    | "review-evaluator"
    | null;
}

export interface ReviewEvent {
  id: string;
  wordId: string;
  word: string;
  sessionId: string | null;
  testMode: TestMode;
  learnerResponse: string;
  result: ReviewResult;
  latencyMs: number | null;
  answerRevealed: boolean;
  contaminated: boolean;
  contextUsed: string | null;
  isNaturalReencounter: boolean;
  occurredAt: string;
  createdAt: string;
}

export interface ReviewEvidence {
  testMode: TestMode;
  result: ReviewResult;
  contaminated: boolean;
  isNaturalReencounter: boolean;
  occurredAt: string;
}

export interface ReviewEvaluation {
  word: string;
  result: ReviewResult;
  testMode: TestMode;
  contaminated: boolean;
  stateBefore: LearningState;
  stateAfter: LearningState;
  containerAfter: WordContainer;
  graduated: boolean;
  reentered: boolean;
  activeUsageVerified: boolean;
  masteryScore: number | null;
  recentResults: ReviewResult[];
  feedback: string;
  nextAction:
    | "continue_active_review"
    | "allow_natural_reencounter"
    | "schedule_repair"
    | "record_exposure_only";
}

export interface SessionPhase {
  phase:
    | "rapid_retrieval"
    | "repair_weak_words"
    | "new_word_intake"
    | "audio_meaning_test";
  minutes: number;
  wordIds: string[];
}

export interface SessionPlan {
  id?: string;
  date: string;
  durationMinutes: number;
  activeReviewCountBefore: number;
  newWordLimit: number;
  debtStatus: "controlled" | "watch" | "blocked";
  activeWordIds: string[];
  newWordIds: string[];
  session: SessionPhase[];
  reason: string;
  nextSkill: "review-evaluator" | null;
}

export interface AppSettings {
  dailyMinutes: number;
  autoplayAudio: boolean;
  audioSpeed: 0.75 | 1 | 1.25;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}
