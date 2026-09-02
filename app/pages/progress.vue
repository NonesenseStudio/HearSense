<script setup lang="ts">
import type { VocabularyAnalysis } from "~~/shared/types/analytics";

useSeoMeta({ title: "学习进度" });

interface AnalyticsResponse {
  data: { analysis: VocabularyAnalysis };
}

function localDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
const end = shallowRef(localDate(new Date()));
const startDate = new Date();
startDate.setDate(startDate.getDate() - 29);
const start = shallowRef(localDate(startDate));
const appliedStart = shallowRef(start.value);
const appliedEnd = shallowRef(end.value);
const query = computed(() => ({
  start: appliedStart.value,
  end: appliedEnd.value,
}));
const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<AnalyticsResponse>("/api/analytics", { query });

const analysis = computed(() => response.value?.data.analysis ?? null);
const totalStates = computed(() =>
  analysis.value
    ? Object.values(analysis.value.stateDistribution).reduce(
        (sum, value) => sum + value,
        0,
      )
    : 0,
);
const chartPoints = computed(() => {
  const series = analysis.value?.poolSeries ?? [];
  if (!series.length) return "";
  const max = Math.max(...series.map((item) => item.count), 1);
  return series
    .map((item, index) => {
      const x =
        series.length === 1 ? 300 : 24 + (index / (series.length - 1)) * 552;
      const y = 156 - (item.count / max) * 128;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
function latency(value: number | null): string {
  return value === null ? "—" : `${(value / 1000).toFixed(1)}s`;
}
function applyRange() {
  appliedStart.value = start.value;
  appliedEnd.value = end.value;
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">EVIDENCE · 数据</p>
        <h1>听力词汇进展</h1>
        <p class="page-subtitle">
          关注从耳熟到秒懂的转换，并把主动复习与自然重遇、音频与文字测试分开。
        </p>
      </div>
    </header>

    <form class="range-filter card" @submit.prevent="applyRange">
      <div class="field">
        <label for="start">开始日期</label
        ><input id="start" v-model="start" type="date" :max="end" />
      </div>
      <div class="field">
        <label for="end">结束日期</label
        ><input id="end" v-model="end" type="date" :min="start" />
      </div>
      <button class="button button--tonal" type="submit">应用范围</button>
    </form>

    <AppState
      v-if="status === 'pending'"
      kind="loading"
      title="正在计算学习指标"
      message="只使用所选区间内有时间戳的真实事件。"
    />
    <AppState
      v-else-if="error"
      kind="error"
      title="无法生成学习报告"
      :message="error.message"
      ><button
        class="button button--tonal"
        type="button"
        @click="() => refresh()"
      >
        重试
      </button></AppState
    >
    <template v-else-if="analysis">
      <div class="analysis-meta">
        <span class="status-chip">置信度 {{ analysis.confidence }}</span
        ><span
          >激活 {{ analysis.sample.activatedWords }} 词 · 有效音频
          {{ analysis.sample.audioTests }} 次 · 观察
          {{ analysis.sample.observedDays }} 天</span
        >
      </div>
      <section class="grid grid--3 metric-grid" aria-label="核心指标">
        <article class="card metric">
          <span class="metric__label">L3 毕业转换率</span>
          <div class="metric__value">
            {{ percent(analysis.metrics.conversionRate) }}
          </div>
          <span class="metric__hint">区间内激活词中完成 L3 转换</span>
        </article>
        <article class="card metric">
          <span class="metric__label">音频即时检索率</span>
          <div class="metric__value">
            {{ percent(analysis.metrics.auditoryRetrievalRate) }}
          </div>
          <span class="metric__hint"
            >{{ analysis.sample.audioTests }} 次未污染音频测试</span
          >
        </article>
        <article class="card metric">
          <span class="metric__label">音频检索中位耗时</span>
          <div class="metric__value">
            {{ latency(analysis.metrics.medianRetrievalLatencyMs) }}
          </div>
          <span class="metric__hint">仅使用存在耗时的音频事件</span>
        </article>
        <article class="card metric">
          <span class="metric__label">主动池稳定性</span>
          <div class="metric__value">
            {{ percent(analysis.metrics.reviewPoolStability) }}
          </div>
          <span class="metric__hint">主动池 ≤ 15 的观察日占比</span>
        </article>
        <article class="card metric">
          <span class="metric__label">自然重遇成功率</span>
          <div class="metric__value">
            {{ percent(analysis.metrics.naturalReencounterSuccess) }}
          </div>
          <span class="metric__hint"
            >{{ analysis.sample.naturalReencounters }} 次真实重遇</span
          >
        </article>
        <article class="card metric">
          <span class="metric__label">毕业后重新入池</span>
          <div class="metric__value">{{ analysis.metrics.reenteredWords }}</div>
          <span class="metric__hint">正常记忆证据，不是惩罚</span>
        </article>
      </section>

      <section class="analytics-layout">
        <article class="card chart-card">
          <h2>L0–L4 当前分布</h2>
          <div
            v-for="(count, state) in analysis.stateDistribution"
            :key="state"
            class="state-bar"
          >
            <strong>{{ state }}</strong>
            <div>
              <span
                :style="{
                  width: totalStates
                    ? `${Math.max(3, (count / totalStates) * 100)}%`
                    : '0%',
                }"
              />
            </div>
            <em>{{ count }}</em>
          </div>
        </article>
        <article class="card chart-card">
          <div class="chart-card__head">
            <h2>主动复习池趋势</h2>
            <span v-if="analysis.metrics.activePoolTrend"
              >{{ analysis.metrics.activePoolTrend.first }} →
              {{ analysis.metrics.activePoolTrend.last }}</span
            >
          </div>
          <svg
            v-if="analysis.poolSeries.length"
            class="trend-chart"
            viewBox="0 0 600 180"
            role="img"
          >
            <title>主动复习池趋势</title>
            <desc>
              所选日期范围内每日主动复习池记录，共
              {{ analysis.poolSeries.length }} 个观测点。
            </desc>
            <line x1="24" y1="156" x2="576" y2="156" />
            <polyline :points="chartPoints" /></svg
          ><AppState
            v-else
            title="没有主动池快照"
            message="开始学习会话后才会形成可追溯的每日趋势。"
          />
        </article>
      </section>

      <section class="analytics-layout">
        <article class="card chart-card">
          <h2>主动复习结果构成</h2>
          <div class="share-row">
            <span>FAIL</span
            ><strong>{{ percent(analysis.metrics.resultShares.fail) }}</strong>
          </div>
          <div class="share-row">
            <span>VAGUE</span
            ><strong>{{ percent(analysis.metrics.resultShares.vague) }}</strong>
          </div>
          <div class="share-row">
            <span>SLOW</span
            ><strong>{{ percent(analysis.metrics.resultShares.slow) }}</strong>
          </div>
          <small
            >分母：{{
              analysis.sample.deliberateReviews
            }}
            次未污染主动复习；自然重遇不混入。</small
          >
        </article>
        <article class="card chart-card">
          <h2>证据支持的调整</h2>
          <template v-if="analysis.findings.length"
            ><div
              v-for="finding in analysis.findings"
              :key="finding.finding"
              class="finding"
            >
              <strong>{{ finding.finding }}</strong
              ><small>证据：{{ finding.evidence.join(" · ") }}</small>
            </div>
            <ol class="recommendations">
              <li v-for="item in analysis.recommendations" :key="item.priority">
                {{ item.action }}
              </li>
            </ol></template
          >
          <p v-else class="page-subtitle">当前样本不足以形成方向性结论。</p>
        </article>
      </section>

      <section
        v-if="analysis.dataQualityNotes.length"
        class="notice notice--warning"
      >
        <strong>数据质量说明</strong>
        <ul class="reason-list">
          <li v-for="note in analysis.dataQualityNotes" :key="note">
            {{ note }}
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
