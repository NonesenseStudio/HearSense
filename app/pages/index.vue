<script setup lang="ts">
import type { SessionPlan } from "~~/shared/types/vocabulary";

useSeoMeta({ title: "今日学习" });

interface PlanResponse {
  data: { plan: SessionPlan };
}
interface RecentReview {
  id: string;
  word: string;
  testMode: string;
  result: string;
  contaminated: boolean;
  occurredAt: string;
}

const { settings } = useLearningSettings();
const duration = shallowRef(settings.value.dailyMinutes);
const today = (() => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
})();
const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<PlanResponse>("/api/session/plan", {
  query: { minutes: duration, today },
});
const { data: recentResponse } = await useFetch<{
  data: { items: RecentReview[] };
}>("/api/reviews/recent");
const starting = shallowRef(false);
const startError = shallowRef<string | null>(null);

onMounted(() => {
  if (duration.value !== settings.value.dailyMinutes) {
    duration.value = settings.value.dailyMinutes;
    void refresh();
  }
});

const phaseLabels: Record<SessionPlan["session"][number]["phase"], string> = {
  rapid_retrieval: "主动词快速检索",
  repair_weak_words: "修复最弱主动词",
  new_word_intake: "录入与学习新词",
  audio_meaning_test: "纯音频词义检索",
};

async function startSession() {
  if (!response.value) return;
  starting.value = true;
  startError.value = null;
  try {
    const created = await $fetch<{ data: { sessionId: string } }>(
      "/api/sessions",
      { method: "POST", body: { durationMinutes: duration.value, today } },
    );
    await navigateTo(`/review?session=${created.data.sessionId}`);
  } catch (cause) {
    const value = cause as { data?: { message?: string }; message?: string };
    startError.value = value.data?.message ?? value.message ?? "无法开始学习。";
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">TODAY · {{ today }}</p>
        <h1>从声音，直达含义</h1>
        <p class="page-subtitle">
          今天只做一段可完成的学习。可以随时停止，不补课，也不累积债务。
        </p>
      </div>
      <div class="field duration-field">
        <label for="duration">可用时间</label
        ><select
          id="duration"
          v-model.number="duration"
          @change="() => refresh()"
        >
          <option :value="20">20 分钟</option>
          <option :value="15">15 分钟</option>
          <option :value="10">10 分钟</option>
          <option :value="5">5 分钟</option>
        </select>
      </div>
    </header>

    <AppState
      v-if="status === 'pending'"
      kind="loading"
      title="正在生成今日计划"
      message="先读取当前主动池，再确定新词上限。"
    />
    <AppState
      v-else-if="error"
      kind="error"
      title="今日计划不可用"
      :message="error.message"
      ><button
        class="button button--tonal"
        type="button"
        @click="() => refresh()"
      >
        重试
      </button></AppState
    >
    <template v-else-if="response">
      <section class="grid grid--3" aria-label="今日概览">
        <article class="card metric">
          <span class="metric__label">主动复习池</span>
          <div class="metric__value">
            {{ response.data.plan.activeReviewCountBefore }}
          </div>
          <span class="metric__hint">计划开始时的真实数量</span>
        </article>
        <article class="card metric">
          <span class="metric__label">今日新词上限</span>
          <div class="metric__value">{{ response.data.plan.newWordLimit }}</div>
          <span class="metric__hint">最多，不是必须完成的配额</span>
        </article>
        <article class="card metric">
          <span class="metric__label">计划时长</span>
          <div class="metric__value">
            {{ response.data.plan.durationMinutes
            }}<span class="metric__unit">分钟</span>
          </div>
          <span class="metric__hint">中途停止不会产生补课</span>
        </article>
      </section>

      <p
        class="notice"
        :class="{
          'notice--warning': response.data.plan.debtStatus !== 'controlled',
        }"
      >
        {{ response.data.plan.reason }}
      </p>
      <section class="card session-plan" aria-label="四阶段学习计划">
        <ol>
          <li
            v-for="(phase, index) in response.data.plan.session"
            :key="phase.phase"
          >
            <span class="phase-number">{{ index + 1 }}</span>
            <div>
              <strong>{{ phaseLabels[phase.phase] }}</strong
              ><small>{{ phase.wordIds.length }} 个词</small>
            </div>
            <time>{{ phase.minutes }} 分钟</time>
          </li>
        </ol>
        <div class="session-plan__actions">
          <span>随时停止 · 不生成补偿任务</span
          ><button
            class="button"
            type="button"
            :disabled="starting || !response.data.plan.nextSkill"
            @click="startSession"
          >
            {{
              starting
                ? "准备中…"
                : response.data.plan.nextSkill
                  ? "开始学习"
                  : "暂无任务"
            }}
            <AppIcon
              v-if="response.data.plan.nextSkill"
              name="arrow"
              :size="19"
            />
          </button>
        </div>
      </section>
      <AppState
        v-if="startError"
        kind="error"
        title="会话未开始"
        :message="startError"
      />

      <section
        class="card card__body recent-learning"
        aria-labelledby="recent-title"
      >
        <div>
          <p class="eyebrow">RECENT</p>
          <h2 id="recent-title">最近学习记录</h2>
        </div>
        <p v-if="!recentResponse?.data.items.length" class="page-subtitle">
          还没有复习事件。完成一次检索后会显示在这里。
        </p>
        <ul v-else>
          <li v-for="item in recentResponse.data.items" :key="item.id">
            <strong>{{ item.word }}</strong
            ><span
              >{{ item.testMode }} · {{ item.result
              }}<small v-if="item.contaminated"> · 已污染</small></span
            ><time :datetime="item.occurredAt">{{
              new Date(item.occurredAt).toLocaleString("zh-CN")
            }}</time>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
