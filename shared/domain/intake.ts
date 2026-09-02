import type { IntakeInput } from "../schemas/vocabulary";
import type {
  IntakeDecision,
  LearningState,
  WordContainer,
} from "../types/vocabulary";

export interface IntakeContext {
  activeReviewCount: number;
  currentState?: LearningState | null;
  currentContainer?: WordContainer | null;
}

export function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function classify(input: IntakeInput): {
  state: LearningState;
  needsClarification: boolean;
} {
  if (input.meaningRecall === "instant")
    return { state: "L3", needsClarification: false };
  if (input.meaningRecall === "slow" || input.meaningRecall === "vague")
    return { state: "L2", needsClarification: false };
  if (input.meaningRecall === "none") {
    const familiar =
      input.heardBefore === true ||
      input.seenBefore === true ||
      input.audioFamiliarity === "high" ||
      input.audioFamiliarity === "medium";
    return { state: familiar ? "L1" : "L0", needsClarification: false };
  }

  const hasFamiliarityEvidence =
    (input.heardBefore !== null && input.heardBefore !== undefined) ||
    (input.seenBefore !== null && input.seenBefore !== undefined) ||
    input.audioFamiliarity !== "unknown";
  if (!hasFamiliarityEvidence) return { state: "L0", needsClarification: true };
  if (
    input.heardBefore ||
    input.seenBefore ||
    input.audioFamiliarity === "high" ||
    input.audioFamiliarity === "medium"
  )
    return { state: "L1", needsClarification: true };
  return { state: "L0", needsClarification: true };
}

function score(input: IntakeInput): { priority: number; reasons: string[] } {
  const factors: Array<{ points: number; reason: string }> = [];
  if ((input.encounterCount ?? 0) >= 3)
    factors.push({ points: 30, reason: "在真实内容中重复遇到" });
  else if ((input.encounterCount ?? 0) >= 1)
    factors.push({ points: 14, reason: "来自一次真实遇见" });
  if (input.audioFamiliarity === "high")
    factors.push({ points: 26, reason: "声音高度熟悉但含义未稳定" });
  else if (input.audioFamiliarity === "medium")
    factors.push({ points: 17, reason: "声音已有熟悉感" });
  if (input.personalRelevance === "high")
    factors.push({ points: 24, reason: "与个人使用场景高度相关" });
  else if (input.personalRelevance === "medium")
    factors.push({ points: 12, reason: "与个人场景相关" });
  if (input.sourceContext)
    factors.push({ points: 12, reason: "保留了可复用的真实上下文" });
  if (input.heardBefore) factors.push({ points: 8, reason: "曾在听力中遇到" });
  const ordered = factors.sort((a, b) => b.points - a.points);
  return {
    priority: Math.min(
      100,
      ordered.reduce((sum, factor) => sum + factor.points, 0),
    ),
    reasons: ordered.slice(0, 2).map((factor) => factor.reason),
  };
}

export function evaluateIntake(
  input: IntakeInput,
  context: IntakeContext,
): IntakeDecision {
  const normalized = normalizeWord(input.word);

  if (context.currentState && context.currentContainer) {
    return {
      word: normalized,
      wordDisplay: input.word.trim(),
      classification: context.currentState,
      container: context.currentContainer,
      admit: context.currentContainer === "active_review",
      priority: null,
      admissionReasons: ["已有词条保留当前学习状态", "本次遇见已追加记录"],
      activationBlockedByDebt: false,
      needsClarification: false,
      clarifyingQuestion: null,
      nextSkill:
        context.currentContainer === "active_review"
          ? "review-evaluator"
          : "daily-session-planner",
    };
  }

  const classified = classify(input);
  const classification = classified.state;
  const ranked = score(input);
  const qualified =
    (classification === "L1" || classification === "L2") &&
    (ranked.priority >= 20 || input.personalRelevance === "high");
  const blocked = qualified && context.activeReviewCount > 15;
  const admit = qualified && !blocked;
  const container: WordContainer =
    classification === "L3" || classification === "L4"
      ? "graduated"
      : admit
        ? "active_review"
        : "candidate_inbox";

  return {
    word: normalized,
    wordDisplay: input.word.trim(),
    classification,
    container,
    admit,
    priority: ranked.priority,
    admissionReasons: ranked.reasons.length
      ? ranked.reasons
      : ["当前缺少重复遇见或个人相关性证据"],
    activationBlockedByDebt: blocked,
    needsClarification:
      classification !== "L3" && classified.needsClarification,
    clarifyingQuestion:
      classification !== "L3" && classified.needsClarification
        ? "只听到这个词、不看到拼写时，你能说出它的大致核心含义吗？"
        : null,
    nextSkill: admit ? "semantic-card" : "daily-session-planner",
  };
}
