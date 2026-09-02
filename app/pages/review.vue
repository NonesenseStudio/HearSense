<script setup lang="ts">
import type {
  ReviewEvaluation,
  ReviewResult,
  SemanticCard,
  TestMode,
  WordRecord,
} from "~~/shared/types/vocabulary";

useSeoMeta({ title: "复习" });

interface ReviewItem {
  wordId: string;
  speechText: string;
  displayText: string;
  contextPrompt: string;
  pronunciation: string | null;
  audioUrl: string | null;
  state: WordRecord["state"];
  retrievalPrompt: string;
}
interface ItemsResponse {
  data: { items: ReviewItem[] };
}
interface AnswerResponse {
  data: { word: WordRecord; card: SemanticCard };
}

const route = useRoute();
const query = computed(() => ({
  word: typeof route.query.word === "string" ? route.query.word : undefined,
}));
const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<ItemsResponse>("/api/review/items", { query });
const currentIndex = shallowRef(0);
const mode = shallowRef<TestMode>("audio");
const stage = shallowRef<"prompt" | "answer" | "evaluated" | "queued">(
  "prompt",
);
const learnerResponse = shallowRef("");
const startedAt = shallowRef(Date.now());
const capturedLatency = shallowRef<number | null>(null);
const contaminated = shallowRef(false);
const answer = shallowRef<AnswerResponse["data"] | null>(null);
const selfAssessment = shallowRef<ReviewResult | null>(null);
const evaluation = shallowRef<ReviewEvaluation | null>(null);
const actionError = shallowRef<string | null>(null);
const busy = shallowRef(false);
const audioButton = shallowRef<{ play: () => Promise<void> } | null>(null);
const { settings } = useLearningSettings();
const { queue, enqueue } = useOfflineQueue();
const queuedSynced = shallowRef(false);
const queuedClientEventId = shallowRef<string | null>(null);

watch(queue, (items) => {
  if (
    queuedClientEventId.value &&
    !items.some((item) => item.id === queuedClientEventId.value)
  )
    queuedSynced.value = true;
});

const currentItem = computed(
  () => response.value?.data.items[currentIndex.value] ?? null,
);
const sessionId =
  typeof route.query.session === "string" ? route.query.session : null;

const modeLabels: Record<TestMode, string> = {
  audio: "音频测试",
  written: "文字测试",
  contextual: "上下文测试",
  production: "主动产出",
};
const resultLabels: Record<ReviewResult, string> = {
  INSTANT: "立即想起",
  SLOW: "想起但较慢",
  VAGUE: "意思模糊",
  FAIL: "没有想起",
};

watch([currentItem, mode], () => {
  resetAttempt();
  if (
    import.meta.client &&
    mode.value === "audio" &&
    settings.value.autoplayAudio
  )
    nextTick(() => void audioButton.value?.play());
});

function resetAttempt() {
  stage.value = "prompt";
  learnerResponse.value = "";
  startedAt.value = Date.now();
  capturedLatency.value = null;
  contaminated.value = false;
  answer.value = null;
  selfAssessment.value = null;
  evaluation.value = null;
  actionError.value = null;
}

function errorMessage(cause: unknown): string {
  const value = cause as {
    data?: { message?: string };
    message?: string;
  } | null;
  return value?.data?.message ?? value?.message ?? "操作失败，请稍后重试。";
}

async function fetchAnswer(revealedBeforeAttempt: boolean) {
  if (!currentItem.value) return;
  busy.value = true;
  actionError.value = null;
  queuedSynced.value = false;
  queuedClientEventId.value = null;
  contaminated.value = revealedBeforeAttempt;
  capturedLatency.value = revealedBeforeAttempt
    ? null
    : Date.now() - startedAt.value;
  try {
    const response = await $fetch<AnswerResponse>(
      `/api/review/${currentItem.value.wordId}/answer`,
    );
    answer.value = response.data;
    stage.value = "answer";
  } catch (cause) {
    actionError.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

async function submitEvaluation() {
  if (!currentItem.value || !selfAssessment.value) return;
  busy.value = true;
  actionError.value = null;
  const payload = {
    wordId: currentItem.value.wordId,
    sessionId,
    clientEventId: crypto.randomUUID(),
    testMode: mode.value,
    learnerResponse: learnerResponse.value,
    selfAssessment: selfAssessment.value,
    latencyMs: capturedLatency.value,
    answerRevealed: contaminated.value,
    contextUsed:
      mode.value === "contextual" ? currentItem.value.contextPrompt : null,
    isNaturalReencounter: false,
    occurredAt: new Date().toISOString(),
  };
  try {
    const result = await $fetch<{ data: { evaluation: ReviewEvaluation } }>(
      "/api/review/events",
      {
        method: "POST",
        body: payload,
      },
    );
    evaluation.value = result.data.evaluation;
    stage.value = "evaluated";
  } catch (cause) {
    const statusCode =
      (cause as { statusCode?: number; status?: number } | null)?.statusCode ??
      (cause as { status?: number } | null)?.status;
    if (!navigator.onLine || !statusCode) {
      const queued = await enqueue("review", "/api/review/events", payload);
      queuedClientEventId.value = queued.id;
      stage.value = "queued";
    } else actionError.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

async function next() {
  await refresh();
  if (currentIndex.value >= (response.value?.data.items.length ?? 1) - 1)
    currentIndex.value = 0;
  else currentIndex.value += 1;
  resetAttempt();
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select")) return;
  if (
    event.code === "Space" &&
    mode.value === "audio" &&
    stage.value === "prompt"
  ) {
    event.preventDefault();
    void audioButton.value?.play();
  }
  if (event.key === "Enter" && stage.value === "prompt")
    void fetchAnswer(false);
  if (stage.value === "answer" && ["1", "2", "3", "4"].includes(event.key))
    selfAssessment.value = (["INSTANT", "SLOW", "VAGUE", "FAIL"] as const)[
      Number(event.key) - 1
    ]!;
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onMounted(() => {
  if (mode.value === "audio" && settings.value.autoplayAudio)
    nextTick(() => void audioButton.value?.play());
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="page review-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">RETRIEVAL FIRST</p>
        <h1>先回忆，再看答案</h1>
        <p class="page-subtitle">
          音频是听力毕业的决定性证据；一次答对不会自动毕业。
        </p>
      </div>
      <span v-if="currentItem" class="status-chip"
        >{{ currentIndex + 1 }} / {{ response?.data.items.length }}</span
      >
    </header>

    <AppState
      v-if="status === 'pending'"
      kind="loading"
      title="正在准备检索"
      message="答案不会随题目提前展示。"
    />
    <AppState
      v-else-if="error"
      kind="error"
      title="无法读取复习池"
      :message="error.message"
      ><button
        class="button button--tonal"
        type="button"
        @click="() => refresh()"
      >
        重试
      </button></AppState
    >
    <AppState
      v-else-if="!currentItem"
      title="暂无可复习单词"
      message="主动复习池为空。这里不会为了凑数量而生成任务。"
      ><NuxtLink class="button button--tonal" to="/intake"
        >录入真实遇到的词</NuxtLink
      ></AppState
    >

    <template v-else>
      <div class="mode-tabs" role="radiogroup" aria-label="测试方式">
        <button
          v-for="(label, value) in modeLabels"
          :key="value"
          type="button"
          role="radio"
          :aria-checked="mode === value"
          :class="{ active: mode === value }"
          :disabled="stage !== 'prompt'"
          @click="mode = value"
        >
          {{ label }}
        </button>
      </div>

      <section class="card retrieval-card">
        <div v-if="stage === 'prompt'" class="retrieval-prompt">
          <template v-if="mode === 'audio'">
            <p class="eyebrow">只听声音，不看拼写</p>
            <AudioButton
              ref="audioButton"
              :word="currentItem.speechText"
              :audio-url="currentItem.audioUrl"
              label="播放测试音频"
              :reveal-word-in-label="false"
            />
            <small>空格：重播</small>
          </template>
          <template v-else-if="mode === 'written'"
            ><p class="eyebrow">看到这个词，你理解什么？</p>
            <div class="written-prompt">
              {{ currentItem.displayText }}
            </div></template
          >
          <template v-else-if="mode === 'contextual'"
            ><p class="eyebrow">从真实语境检索核心含义</p>
            <blockquote>{{ currentItem.contextPrompt }}</blockquote></template
          >
          <template v-else
            ><p class="eyebrow">主动产出是可选的高级能力</p>
            <div class="written-prompt">{{ currentItem.displayText }}</div>
            <p>请口头或书面自然地使用它。</p></template
          >
          <div class="field response-field">
            <label for="response">你的回忆（可口述后简记）</label
            ><textarea
              id="response"
              v-model="learnerResponse"
              maxlength="2000"
              placeholder="先尝试回忆核心含义，再锁定回答"
            />
          </div>
          <div class="retrieval-actions">
            <button
              class="button button--text"
              type="button"
              :disabled="busy"
              @click="fetchAnswer(true)"
            >
              直接看答案（会标记污染）</button
            ><button
              class="button"
              type="button"
              :disabled="busy"
              @click="fetchAnswer(false)"
            >
              锁定回答并看答案
            </button>
          </div>
        </div>

        <div v-else-if="answer && stage === 'answer'" class="answer-panel">
          <div class="answer-panel__word">
            <div>
              <p class="eyebrow">答案</p>
              <h2>{{ answer.word.wordDisplay }}</h2>
              <p v-if="answer.card.pronunciation">
                {{ answer.card.pronunciation }}
              </p>
            </div>
            <AudioButton
              :word="answer.word.word"
              :audio-url="answer.card.audioUrl"
            />
          </div>
          <div class="meaning-block">
            <strong>{{ answer.card.coreMeaningEn }}</strong
            ><span>{{ answer.card.coreMeaningZh }}</span>
          </div>
          <blockquote>{{ answer.card.anchorSentence }}</blockquote>
          <div class="scene-block">
            <span>想象场景</span>
            <p>{{ answer.card.semanticScene }}</p>
          </div>
          <p v-if="contaminated" class="notice notice--warning">
            答案在回答锁定前显示，本次将保存为
            contaminated，只算接触，不参与毕业。
          </p>
          <fieldset class="result-picker">
            <legend>这次真实回忆得怎样？</legend>
            <button
              v-for="(label, value, index) in resultLabels"
              :key="value"
              type="button"
              :class="{ active: selfAssessment === value }"
              @click="selfAssessment = value"
            >
              <kbd>{{ index + 1 }}</kbd
              >{{ label }}
            </button>
          </fieldset>
          <button
            class="button"
            type="button"
            :disabled="busy || !selfAssessment"
            @click="submitEvaluation"
          >
            确认并记录事件
          </button>
        </div>

        <div v-else-if="evaluation" class="evaluation-panel">
          <div
            class="evaluation-result"
            :class="`evaluation-result--${evaluation.result.toLowerCase()}`"
          >
            {{ evaluation.result }}
          </div>
          <h2>{{ evaluation.stateBefore }} → {{ evaluation.stateAfter }}</h2>
          <p>{{ evaluation.feedback }}</p>
          <p v-if="capturedLatency !== null" class="latency">
            检索耗时 {{ (capturedLatency / 1000).toFixed(1) }} 秒
          </p>
          <div class="retrieval-actions">
            <NuxtLink class="button button--text" to="/">安全停止</NuxtLink
            ><button class="button" type="button" @click="next">
              下一个 <AppIcon name="arrow" :size="18" />
            </button>
          </div>
        </div>
        <div v-else-if="stage === 'queued'" class="evaluation-panel">
          <AppState
            :kind="queuedSynced ? 'success' : 'offline'"
            :title="queuedSynced ? '复习事件已同步' : '复习事件已在本机暂存'"
            :message="
              queuedSynced
                ? '事件已写入服务端；词汇状态由同一状态机重新评估。'
                : '本次结果尚未写入 D1，因此当前词汇状态与毕业判断都没有被提前更新。联网同步后，服务端会按同一状态机重新评估。'
            "
          />
          <div class="retrieval-actions">
            <NuxtLink class="button button--text" to="/">安全停止</NuxtLink
            ><button class="button" type="button" @click="next">
              继续下一词
            </button>
          </div>
        </div>
      </section>
      <AppState
        v-if="actionError"
        kind="error"
        title="本次事件没有保存"
        :message="actionError"
      />
    </template>
  </div>
</template>
