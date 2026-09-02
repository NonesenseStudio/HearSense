import type { ReviewSubmission } from "../schemas/vocabulary";
import type {
  ReviewEvaluation,
  ReviewEvidence,
  ReviewResult,
  WordRecord,
} from "../types/vocabulary";

const scores: Record<ReviewResult, number> = {
  FAIL: 0,
  VAGUE: 1,
  SLOW: 2,
  INSTANT: 3,
};

function classifyResult(submission: ReviewSubmission): ReviewResult {
  if (
    submission.selfAssessment === "INSTANT" &&
    submission.latencyMs !== null &&
    submission.latencyMs !== undefined &&
    submission.latencyMs > 2000
  )
    return "SLOW";
  return submission.selfAssessment;
}

export function evaluateReview(
  word: WordRecord,
  submission: ReviewSubmission,
  history: ReviewEvidence[],
): ReviewEvaluation {
  const result = classifyResult(submission);
  const contaminated = submission.answerRevealed;
  const current: ReviewEvidence = {
    testMode: submission.testMode,
    result,
    contaminated,
    isNaturalReencounter: submission.isNaturalReencounter,
    occurredAt: submission.occurredAt,
  };
  const evidence = [...history, current].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const valid = evidence.filter((item) => !item.contaminated);
  const recentResults = valid
    .slice(-5)
    .map((item) => item.result)
    .reverse();
  const masteryScore = recentResults.length
    ? Math.round(
        (recentResults.reduce((sum, item) => sum + scores[item], 0) /
          recentResults.length) *
          100,
      ) / 100
    : null;

  let stateAfter = word.state;
  let activeUsageVerified = word.activeUsageVerified;
  let graduated = false;
  let reentered = false;
  let nextAction: ReviewEvaluation["nextAction"] = "continue_active_review";
  let feedback = "已记录本次检索证据，继续保持声音到含义的路径。";

  if (contaminated) {
    nextAction = "record_exposure_only";
    feedback = "答案在回忆前已显示：本次只记录为接触，不用于毕业判断。";
  } else if (
    (word.state === "L3" || word.state === "L4") &&
    (submission.testMode === "audio" || submission.isNaturalReencounter) &&
    (result === "FAIL" || result === "VAGUE")
  ) {
    stateAfter = "L2";
    reentered = true;
    nextAction = "schedule_repair";
    feedback = "这个词已重新进入主动修复池，这是正常的记忆证据，不是惩罚。";
  } else if (
    submission.testMode === "production" &&
    word.state === "L3" &&
    result === "INSTANT"
  ) {
    stateAfter = "L4";
    activeUsageVerified = true;
    nextAction = "allow_natural_reencounter";
    feedback = "已观察到自然主动产出证据，记录为 L4。";
  } else if (word.state === "L1" || word.state === "L2") {
    if (result === "VAGUE" || result === "SLOW") {
      stateAfter = "L2";
    } else if (result === "INSTANT") {
      const latestAudio = valid
        .filter((item) => item.testMode === "audio")
        .slice(-3);
      const latestRelevant = valid
        .filter(
          (item) => item.testMode === "audio" || item.isNaturalReencounter,
        )
        .slice(-2);
      const stabilityGate =
        submission.testMode === "audio" &&
        latestAudio.filter((item) => item.result === "INSTANT").length >= 2 &&
        !latestRelevant.some(
          (item) => item.result === "FAIL" || item.result === "VAGUE",
        );
      if (stabilityGate) {
        stateAfter = "L3";
        graduated = true;
        nextAction = "allow_natural_reencounter";
        feedback = "最近的独立音频证据已达到稳定门槛，可以离开日常主动复习。";
      } else {
        stateAfter = "L2";
        feedback =
          submission.testMode === "audio"
            ? "这次立即理解是积极证据；仍需另一场独立音频检索确认稳定性。"
            : "文字或语境检索已记录，但不能单独证明听力毕业。";
      }
    }
  }

  const containerAfter =
    stateAfter === "L3" || stateAfter === "L4"
      ? "graduated"
      : stateAfter === "L0"
        ? "candidate_inbox"
        : "active_review";
  return {
    word: word.word,
    result,
    testMode: submission.testMode,
    contaminated,
    stateBefore: word.state,
    stateAfter,
    containerAfter,
    graduated,
    reentered,
    activeUsageVerified,
    masteryScore,
    recentResults,
    feedback,
    nextAction,
  };
}
