import type {
  SessionPhase,
  SessionPlan,
  WordRecord,
} from "../types/vocabulary";

export interface PlannerCandidate {
  word: WordRecord;
  priority: number | null;
}

const resultPriority = {
  FAIL: 0,
  VAGUE: 1,
  SLOW: 2,
  INSTANT: 3,
  none: 4,
} as const;

export function newWordAllowance(activeReviewCount: number): number {
  if (activeReviewCount > 15) return 0;
  if (activeReviewCount >= 12) return 2;
  if (activeReviewCount >= 8) return 3;
  return 5;
}

export function allocateSessionMinutes(
  durationMinutes: number,
): [number, number, number, number] {
  const duration = Math.min(20, Math.max(0, durationMinutes));
  const firstThree = [0.15, 0.35, 0.3].map(
    (weight) => Math.round(duration * weight * 10) / 10,
  );
  const final =
    Math.round(
      (duration - firstThree.reduce((sum, value) => sum + value, 0)) * 10,
    ) / 10;
  return [firstThree[0]!, firstThree[1]!, firstThree[2]!, final];
}

export function generateSessionPlan(input: {
  activeWords: WordRecord[];
  candidateWords: PlannerCandidate[];
  availableTimeMinutes?: number;
  today: string;
}): SessionPlan {
  const durationMinutes = Math.min(
    20,
    Math.max(0, input.availableTimeMinutes ?? 20),
  );
  const activeReviewCount = input.activeWords.length;
  const newWordLimit = newWordAllowance(activeReviewCount);
  const [rapidMinutes, repairMinutes, intakeMinutes, audioMinutes] =
    allocateSessionMinutes(durationMinutes);

  const active = [...input.activeWords].sort((a, b) => {
    const aRank = resultPriority[a.lastResult ?? "none"];
    const bRank = resultPriority[b.lastResult ?? "none"];
    if (aRank !== bRank) return aRank - bRank;
    return (b.lastEncounterAt ?? b.updatedAt).localeCompare(
      a.lastEncounterAt ?? a.updatedAt,
    );
  });
  const candidates = [...input.candidateWords].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );

  const rapidIds = active
    .slice(0, Math.max(1, Math.floor(rapidMinutes * 2)))
    .map((word) => word.id);
  const repairIds = active
    .filter((word) => word.lastResult !== "INSTANT")
    .slice(0, Math.max(1, Math.floor(repairMinutes / 2)))
    .map((word) => word.id);
  const newIds = candidates
    .slice(0, Math.min(newWordLimit, Math.floor(intakeMinutes)))
    .map((item) => item.word.id);
  const audioIds = [...new Set([...rapidIds, ...repairIds, ...newIds])].slice(
    0,
    Math.max(1, Math.floor(audioMinutes * 2)),
  );

  const session: SessionPhase[] = [
    { phase: "rapid_retrieval", minutes: rapidMinutes, wordIds: rapidIds },
    { phase: "repair_weak_words", minutes: repairMinutes, wordIds: repairIds },
    { phase: "new_word_intake", minutes: intakeMinutes, wordIds: newIds },
    { phase: "audio_meaning_test", minutes: audioMinutes, wordIds: audioIds },
  ];
  const debtStatus =
    activeReviewCount > 15
      ? "blocked"
      : activeReviewCount >= 12
        ? "watch"
        : "controlled";

  return {
    date: input.today,
    durationMinutes,
    activeReviewCountBefore: activeReviewCount,
    newWordLimit,
    debtStatus,
    activeWordIds: [...new Set([...rapidIds, ...repairIds])],
    newWordIds: newIds,
    session,
    reason:
      activeReviewCount > 15
        ? "主动复习池超过 15，今天不加入新词，优先修复现有弱词。"
        : `主动复习池为 ${activeReviewCount}，新词最多 ${newWordLimit} 个；少于上限也完全有效。`,
    nextSkill: active.length || newIds.length ? "review-evaluator" : null,
  };
}
