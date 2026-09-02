import type { AnalyticsDataset, VocabularyAnalysis } from "../types/analytics";

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 1000) / 1000;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function analyzeVocabulary(
  dataset: AnalyticsDataset,
): VocabularyAnalysis {
  const dataQualityNotes: string[] = [];
  const validReviews = dataset.reviewEvents.filter((event) => {
    if (!event.occurredAt) {
      dataQualityNotes.push("存在缺少时间戳的复习事件，已从区间指标中排除。");
      return false;
    }
    return !event.contaminated;
  });
  const audioTests = validReviews.filter(
    (event) => event.testMode === "audio" && !event.isNaturalReencounter,
  );
  const deliberateReviews = validReviews.filter(
    (event) => !event.isNaturalReencounter,
  );
  const natural = dataset.naturalReencounters.filter((event) => {
    if (!event.occurredAt) {
      dataQualityNotes.push("存在缺少时间戳的自然重遇事件，已从成功率中排除。");
      return false;
    }
    return true;
  });
  const poolSeries = dataset.poolSnapshots
    .filter((item): item is { date: string; count: number } =>
      Boolean(item.date),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (poolSeries.length !== dataset.poolSnapshots.length)
    dataQualityNotes.push("存在缺少日期的主动池快照，已从趋势中排除。");

  const activatedSet = new Set(dataset.activatedWordIds);
  const conversionRate = rate(
    new Set(dataset.graduatedWordIds.filter((id) => activatedSet.has(id))).size,
    activatedSet.size,
  );
  const reviewPoolStability = rate(
    poolSeries.filter((item) => item.count <= 15).length,
    poolSeries.length,
  );
  const auditoryRetrievalRate = rate(
    audioTests.filter((event) => event.result === "INSTANT").length,
    audioTests.length,
  );
  const medianRetrievalLatencyMs = median(
    audioTests.flatMap((event) =>
      typeof event.latencyMs === "number" ? [event.latencyMs] : [],
    ),
  );
  const naturalReencounterSuccess = rate(
    natural.filter((event) => event.understood).length,
    natural.length,
  );
  const resultShares = {
    fail: rate(
      deliberateReviews.filter((event) => event.result === "FAIL").length,
      deliberateReviews.length,
    ),
    vague: rate(
      deliberateReviews.filter((event) => event.result === "VAGUE").length,
      deliberateReviews.length,
    ),
    slow: rate(
      deliberateReviews.filter((event) => event.result === "SLOW").length,
      deliberateReviews.length,
    ),
  };
  const activePoolTrend = poolSeries.length
    ? {
        first: poolSeries[0]!.count,
        last: poolSeries.at(-1)!.count,
        direction: (poolSeries.at(-1)!.count > poolSeries[0]!.count
          ? "up"
          : poolSeries.at(-1)!.count < poolSeries[0]!.count
            ? "down"
            : "flat") as "up" | "down" | "flat",
      }
    : null;
  const reenteredWords = new Set(
    validReviews
      .filter((event) => event.reentered)
      .map((event) => event.wordId),
  ).size;

  const activatedWords = activatedSet.size;
  const daySpan = Math.max(
    1,
    Math.round(
      (Date.parse(`${dataset.period.end}T00:00:00Z`) -
        Date.parse(`${dataset.period.start}T00:00:00Z`)) /
        86_400_000,
    ) + 1,
  );
  const confidence: VocabularyAnalysis["confidence"] =
    activatedWords < 5 || audioTests.length < 10
      ? "low"
      : daySpan >= 30 && activatedWords >= 20 && audioTests.length >= 50
        ? "high"
        : "adequate";

  const findings: VocabularyAnalysis["findings"] = [];
  const recommendations: VocabularyAnalysis["recommendations"] = [];
  if (
    activePoolTrend?.direction === "up" ||
    (reviewPoolStability !== null && reviewPoolStability < 0.8)
  ) {
    findings.push({
      finding: "主动复习池压力正在上升或稳定性不足。",
      evidence: ["reviewPoolStability", "activePoolTrend"],
    });
    recommendations.push({
      priority: 1,
      action: "暂时降低新词录入量，先修复现有 FAIL、VAGUE 和 SLOW。",
      lever: "reduce_new_word_allowance",
    });
  }
  if (auditoryRetrievalRate !== null && auditoryRetrievalRate < 0.6) {
    findings.push({
      finding: "音频即时检索仍不稳定。",
      evidence: ["auditoryRetrievalRate", "audioTests"],
    });
    recommendations.push({
      priority: recommendations.length + 1,
      action: "修复语义场景，并优先增加音频检索占比，不增加总时长。",
      lever: "increase_audio_only_tests",
    });
  }
  if ((resultShares.fail ?? 0) + (resultShares.vague ?? 0) >= 0.4) {
    findings.push({
      finding: "FAIL 与 VAGUE 在主动复习中占比较高。",
      evidence: [
        "resultShares.fail",
        "resultShares.vague",
        "deliberateReviews",
      ],
    });
    recommendations.push({
      priority: recommendations.length + 1,
      action: "检查核心释义和真实来源上下文，重建最弱词的语义锚点。",
      lever: "repair_semantic_cards",
    });
  }
  if (
    !findings.length &&
    confidence !== "low" &&
    auditoryRetrievalRate !== null
  ) {
    findings.push({
      finding: "现有证据与可持续的听力词汇转换一致。",
      evidence: [
        "auditoryRetrievalRate",
        "reviewPoolStability",
        "conversionRate",
      ],
    });
    recommendations.push({
      priority: 1,
      action: "保持当前学习上限与音频优先策略。",
      lever: "maintain",
    });
  }
  if (confidence === "low")
    dataQualityNotes.push(
      "激活词少于 5 个或有效音频测试少于 10 次，当前结论置信度低。",
    );

  return {
    period: dataset.period,
    sample: {
      activatedWords,
      audioTests: audioTests.length,
      deliberateReviews: deliberateReviews.length,
      naturalReencounters: natural.length,
      observedDays: poolSeries.length,
    },
    stateDistribution: dataset.stateDistribution,
    metrics: {
      conversionRate,
      reviewPoolStability,
      auditoryRetrievalRate,
      medianRetrievalLatencyMs,
      naturalReencounterSuccess,
      activePoolTrend,
      resultShares,
      reenteredWords,
    },
    poolSeries,
    confidence,
    findings: findings.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
    dataQualityNotes: [...new Set(dataQualityNotes)],
  };
}
