import { z } from "zod";
import {
  AUDIO_FAMILIARITIES,
  LEARNING_STATES,
  PERSONAL_RELEVANCES,
  REVIEW_RESULTS,
  TEST_MODES,
  WORD_CONTAINERS,
  WORD_SOURCES,
} from "../types/vocabulary";

export const learningStateSchema = z.enum(LEARNING_STATES);
export const wordContainerSchema = z.enum(WORD_CONTAINERS);
export const reviewResultSchema = z.enum(REVIEW_RESULTS);
export const testModeSchema = z.enum(TEST_MODES);
export const wordSourceSchema = z.enum(WORD_SOURCES);
export const audioFamiliaritySchema = z.enum(AUDIO_FAMILIARITIES);
export const personalRelevanceSchema = z.enum(PERSONAL_RELEVANCES);

const nullableTrimmed = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const intakeInputSchema = z.object({
  clientEventId: z.uuid().optional(),
  word: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z][A-Za-z\s'-]*$/, "请输入英文单词或短语"),
  learnerReport: nullableTrimmed(1000),
  source: wordSourceSchema.nullable().optional(),
  sourceContext: nullableTrimmed(2000),
  encounterCount: z.number().int().min(0).max(10000).nullable().optional(),
  heardBefore: z.boolean().nullable().optional(),
  seenBefore: z.boolean().nullable().optional(),
  meaningRecall: z
    .enum(["none", "vague", "slow", "instant", "unknown"])
    .default("unknown"),
  audioFamiliarity: audioFamiliaritySchema.default("unknown"),
  personalRelevance: personalRelevanceSchema.default("unknown"),
  occurredAt: z.iso.datetime().nullable().optional(),
});

export const semanticCardInputSchema = z.object({
  pronunciation: nullableTrimmed(200),
  audioUrl: z.url().max(2000).nullable().optional(),
  coreMeaningEn: z.string().trim().min(1).max(500),
  coreMeaningZh: z.string().trim().min(1).max(200),
  anchorSentence: z.string().trim().min(1).max(1000),
  semanticScene: z.string().trim().min(1).max(1000),
  exampleOrigin: z.enum(["learner_source", "generated"]),
  retrievalPrompt: z.string().trim().min(1).max(300),
  contextNote: nullableTrimmed(1000),
});

export const reviewSubmissionSchema = z.object({
  wordId: z.uuid(),
  sessionId: z.uuid().nullable().optional(),
  clientEventId: z.uuid().optional(),
  testMode: testModeSchema,
  learnerResponse: z.string().trim().max(2000),
  selfAssessment: reviewResultSchema,
  latencyMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  answerRevealed: z.boolean(),
  contextUsed: nullableTrimmed(2000),
  isNaturalReencounter: z.boolean().default(false),
  occurredAt: z.iso.datetime(),
});

export const settingsInputSchema = z.object({
  dailyMinutes: z.number().int().min(5).max(20),
  autoplayAudio: z.boolean(),
  audioSpeed: z.union([z.literal(0.75), z.literal(1), z.literal(1.25)]),
});

export const dateRangeSchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
  })
  .refine((value) => value.start <= value.end, {
    message: "开始日期不能晚于结束日期",
  });

export type IntakeInput = z.infer<typeof intakeInputSchema>;
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type SemanticCardInput = z.infer<typeof semanticCardInputSchema>;
