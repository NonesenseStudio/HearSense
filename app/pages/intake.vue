<script setup lang="ts">
import {
  applySemanticSense,
  type SemanticCardDraft,
} from "~~/shared/domain/semantic-card";
import type {
  IntakeDecision,
  SemanticCard,
  WordRecord,
} from "~~/shared/types/vocabulary";
import type { DictionarySuggestion } from "~~/shared/types/dictionary";

useSeoMeta({ title: "录入单词" });

interface IntakeResponse {
  data: {
    word: WordRecord;
    decision: IntakeDecision;
    cardDraft: SemanticCardDraft | null;
    activeReviewCountBefore: number;
  };
}

interface SuggestionsResponse {
  data: {
    items: DictionarySuggestion[];
  };
}

const form = ref({
  word: "",
  source: "" as "" | WordRecord["source"],
  sourceContext: "",
  learnerReport: "",
  encounterCount: 1 as number | null,
  meaningRecall: "" as "none" | "vague" | "slow" | "instant" | "unknown" | "",
  audioFamiliarity: "unknown" as WordRecord["audioFamiliarity"],
  personalRelevance: "unknown" as WordRecord["personalRelevance"],
});
const submitting = shallowRef(false);
const submitError = shallowRef<string | null>(null);
const result = shallowRef<IntakeResponse["data"] | null>(null);
const cardForm = ref<SemanticCardDraft | null>(null);
const savingCard = shallowRef(false);
const cardSaved = shallowRef<SemanticCard | null>(null);
const cardDeferred = shallowRef(false);
const queuedOffline = shallowRef(false);
const queuedSynced = shallowRef(false);
const queuedClientEventId = shallowRef<string | null>(null);
const suggestions = shallowRef<DictionarySuggestion[]>([]);
const suggestionsOpen = shallowRef(false);
const suggestionsLoading = shallowRef(false);
const highlightedSuggestion = shallowRef(-1);
const { queue, enqueue } = useOfflineQueue();

const cardComplete = computed(() => {
  const card = cardForm.value;
  return Boolean(
    card &&
      card.coreMeaningEn.trim() &&
      card.coreMeaningZh.trim() &&
      card.anchorSentence.trim() &&
      card.semanticScene.trim() &&
      card.retrievalPrompt.trim(),
  );
});

const classificationLabels: Record<IntakeDecision["classification"], string> = {
  L0: "暂不熟悉",
  L1: "声音熟、词义不稳",
  L2: "词义想得慢",
  L3: "听到即懂",
  L4: "能够自然使用",
};

const containerLabels: Record<IntakeDecision["container"], string> = {
  candidate_inbox: "候选箱",
  active_review: "主动复习",
  graduated: "已掌握",
};

const suggestionPattern = /^[A-Za-z][A-Za-z\s'-]*$/;
let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
let suggestionCloseTimer: ReturnType<typeof setTimeout> | undefined;
let suggestionRequestId = 0;
let suggestionAbortController: AbortController | null = null;
let suppressSuggestionFetch = false;

watch(queue, (items) => {
  if (
    queuedClientEventId.value &&
    !items.some((item) => item.id === queuedClientEventId.value)
  ) {
    queuedOffline.value = false;
    queuedSynced.value = true;
  }
});

function errorMessage(cause: unknown): string {
  if (cause && typeof cause === "object") {
    const value = cause as { data?: { message?: string }; message?: string };
    return value.data?.message ?? value.message ?? "请求失败，请稍后重试。";
  }
  return "请求失败，请稍后重试。";
}

function normalizeSuggestionQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function clearSuggestionTimer() {
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = undefined;
}

function cancelSuggestionRequest() {
  suggestionAbortController?.abort();
  suggestionAbortController = null;
}

function openSuggestions() {
  if (suggestions.value.length || suggestionsLoading.value)
    suggestionsOpen.value = true;
}

function scheduleSuggestionClose() {
  if (suggestionCloseTimer) clearTimeout(suggestionCloseTimer);
  suggestionCloseTimer = setTimeout(() => {
    suggestionsOpen.value = false;
    highlightedSuggestion.value = -1;
  }, 120);
}

async function loadSuggestions(query: string, requestId: number) {
  if (requestId !== suggestionRequestId) return;
  const controller = new AbortController();
  suggestionAbortController = controller;
  suggestionsLoading.value = true;
  try {
    const response = await $fetch<SuggestionsResponse>(
      "/api/dictionary/suggest",
      {
        query: { q: query, limit: 8 },
        signal: controller.signal,
      },
    );
    if (requestId !== suggestionRequestId || controller.signal.aborted) return;
    suggestions.value = response.data.items;
    suggestionsOpen.value = suggestions.value.length > 0;
    highlightedSuggestion.value = -1;
  } catch {
    if (requestId !== suggestionRequestId || controller.signal.aborted) return;
    suggestions.value = [];
    suggestionsOpen.value = false;
  } finally {
    if (requestId === suggestionRequestId) {
      suggestionsLoading.value = false;
      suggestionAbortController = null;
    }
  }
}

watch(
  () => form.value.word,
  (value) => {
    clearSuggestionTimer();
    cancelSuggestionRequest();
    const requestId = ++suggestionRequestId;
    highlightedSuggestion.value = -1;

    if (suppressSuggestionFetch) {
      suppressSuggestionFetch = false;
      suggestions.value = [];
      suggestionsOpen.value = false;
      suggestionsLoading.value = false;
      return;
    }

    const query = normalizeSuggestionQuery(value);
    suggestions.value = [];
    suggestionsOpen.value = Boolean(query);
    suggestionsLoading.value = false;
    if (!query || !suggestionPattern.test(query)) {
      suggestionsOpen.value = false;
      return;
    }

    suggestionTimer = setTimeout(() => {
      void loadSuggestions(query, requestId);
    }, 180);
  },
);

function selectSuggestion(headword: string) {
  if (suggestionCloseTimer) clearTimeout(suggestionCloseTimer);
  clearSuggestionTimer();
  cancelSuggestionRequest();
  suggestionRequestId += 1;
  suppressSuggestionFetch = form.value.word !== headword;
  form.value.word = headword;
  suggestions.value = [];
  suggestionsOpen.value = false;
  suggestionsLoading.value = false;
  highlightedSuggestion.value = -1;
}

function handleSuggestionKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    suggestionsOpen.value = false;
    highlightedSuggestion.value = -1;
    return;
  }
  if (!suggestions.value.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    suggestionsOpen.value = true;
    highlightedSuggestion.value =
      (highlightedSuggestion.value + 1) % suggestions.value.length;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    suggestionsOpen.value = true;
    highlightedSuggestion.value =
      highlightedSuggestion.value <= 0
        ? suggestions.value.length - 1
        : highlightedSuggestion.value - 1;
  } else if (event.key === "Enter" && highlightedSuggestion.value >= 0) {
    event.preventDefault();
    const suggestion = suggestions.value[highlightedSuggestion.value];
    if (suggestion) selectSuggestion(suggestion.headword);
  }
}

function selectSense(index: number) {
  if (cardForm.value)
    cardForm.value = applySemanticSense(cardForm.value, index);
}

function handleSenseChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  selectSense(Number(target.value));
}

function deferCard() {
  cardDeferred.value = true;
}

onBeforeUnmount(() => {
  clearSuggestionTimer();
  if (suggestionCloseTimer) clearTimeout(suggestionCloseTimer);
  cancelSuggestionRequest();
});

async function submit() {
  submitting.value = true;
  submitError.value = null;
  result.value = null;
  queuedOffline.value = false;
  queuedSynced.value = false;
  queuedClientEventId.value = null;
  cardSaved.value = null;
  cardDeferred.value = false;
  cardForm.value = null;
  const payload = {
    clientEventId: crypto.randomUUID(),
    word: form.value.word,
    source: form.value.source || null,
    sourceContext: form.value.sourceContext || null,
    learnerReport: form.value.learnerReport || null,
    encounterCount: form.value.encounterCount,
    // The intake UI asks one plain-language audio-familiarity question. Keep
    // the legacy fields null rather than asking the same thing twice.
    heardBefore: null,
    seenBefore: null,
    meaningRecall: form.value.meaningRecall || "unknown",
    audioFamiliarity: form.value.audioFamiliarity,
    personalRelevance: form.value.personalRelevance,
    occurredAt: new Date().toISOString(),
  };
  try {
    const response = await $fetch<IntakeResponse>("/api/intake", {
      method: "POST",
      body: payload,
    });
    result.value = response.data;
    cardForm.value = response.data.cardDraft
      ? { ...response.data.cardDraft }
      : null;
  } catch (cause) {
    const statusCode =
      (cause as { statusCode?: number; status?: number } | null)?.statusCode ??
      (cause as { status?: number } | null)?.status;
    if (!navigator.onLine || !statusCode) {
      const queued = await enqueue("intake", "/api/intake", payload);
      queuedClientEventId.value = queued.id;
      queuedOffline.value = true;
    } else submitError.value = errorMessage(cause);
  } finally {
    submitting.value = false;
  }
}

async function saveCard() {
  if (!result.value || !cardForm.value || !cardComplete.value) return;
  savingCard.value = true;
  submitError.value = null;
  try {
    const response = await $fetch<{ data: { card: SemanticCard } }>(
      `/api/words/${result.value.word.id}/cards`,
      { method: "POST", body: cardForm.value },
    );
    cardSaved.value = response.data.card;
  } catch (cause) {
    submitError.value = errorMessage(cause);
  } finally {
    savingCard.value = false;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">WORD INTAKE</p>
        <h1>记录一次真实遇见</h1>
        <p class="page-subtitle">
          只记录你当下能判断的事实；不记得意思、原句或次数都没关系，系统会保守处理。
        </p>
      </div>
    </header>

    <form class="card card__body" @submit.prevent="submit">
      <div class="form-grid">
        <div class="field word-field">
          <label for="word">英文单词或短语 *</label>
          <div class="word-suggest">
            <input
              id="word"
              v-model="form.word"
              required
              type="text"
              maxlength="100"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="word-suggestion-list"
              :aria-expanded="
                suggestionsOpen &&
                (suggestionsLoading || suggestions.length > 0)
              "
              :aria-activedescendant="
                highlightedSuggestion >= 0
                  ? `word-suggestion-${highlightedSuggestion}`
                  : undefined
              "
              placeholder="例如 astonish"
              @focus="openSuggestions"
              @blur="scheduleSuggestionClose"
              @keydown="handleSuggestionKeydown"
            />
            <ul
              v-if="
                suggestionsOpen &&
                (suggestionsLoading || suggestions.length > 0)
              "
              id="word-suggestion-list"
              class="word-suggest__list"
              role="listbox"
              aria-label="单词联想"
            >
              <li v-if="suggestionsLoading" class="word-suggest__loading">
                正在联想…
              </li>
              <li
                v-for="(suggestion, index) in suggestions"
                :id="`word-suggestion-${index}`"
                :key="suggestion.headword"
                role="option"
                :aria-selected="highlightedSuggestion === index"
              >
                <button
                  class="word-suggest__option"
                  :class="{
                    'word-suggest__option--active':
                      highlightedSuggestion === index,
                  }"
                  type="button"
                  @mousedown.prevent
                  @click="selectSuggestion(suggestion.headword)"
                >
                  <span class="word-suggest__word">
                    {{ suggestion.headword }}
                  </span>
                  <span
                    v-if="suggestion.phonetic"
                    class="word-suggest__phonetic"
                  >
                    {{ suggestion.phonetic }}
                  </span>
                  <span
                    v-if="suggestion.definitionZh"
                    class="word-suggest__definition"
                  >
                    {{ suggestion.definitionZh }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div class="field">
          <label for="source">来源</label
          ><select id="source" v-model="form.source">
            <option value="">未说明</option>
            <option value="movie">电影</option>
            <option value="tv">电视剧</option>
            <option value="song">歌曲</option>
            <option value="youtube">YouTube</option>
            <option value="podcast">播客</option>
            <option value="game">游戏</option>
            <option value="conversation">对话</option>
            <option value="book">书籍</option>
            <option value="article">文章</option>
            <option value="school">学校</option>
            <option value="work">工作</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div class="field form-grid__full">
          <label for="context">当时的原句或场景（可选）</label
          ><textarea
            id="context"
            v-model="form.sourceContext"
            maxlength="2000"
            placeholder="记得原句就贴原句；只记得画面或对话片段也可以"
          />
        </div>
        <div class="field form-grid__full">
          <label for="report">哪里卡住了（可选）</label
          ><textarea
            id="report"
            v-model="form.learnerReport"
            maxlength="1000"
            placeholder="例如：声音很熟，但想不起意思；或只记得大概语气"
          />
        </div>
        <div class="field">
          <label for="encounters">大概遇到过几次（可选）</label
          ><select id="encounters" v-model="form.encounterCount">
            <option :value="1">第一次</option>
            <option :value="2">两次左右</option>
            <option :value="3">三次左右</option>
            <option :value="5">四次以上</option>
            <option :value="null">记不清</option>
          </select>
        </div>
        <div class="field">
          <label for="meaning">只听声音时的理解程度 *</label
          ><select id="meaning" v-model="form.meaningRecall" required>
            <option value="" disabled>请选择最接近的一项</option>
            <option value="none">完全想不起意思</option>
            <option value="vague">只有模糊感觉</option>
            <option value="slow">想一会儿才能说出</option>
            <option value="instant">听到就能理解</option>
            <option value="unknown">现在还不确定</option>
          </select>
          <span class="field-hint">不确定也可以选，系统不会因此强行激活。</span>
        </div>
        <div class="field">
          <label for="audio-familiarity">这个声音有多熟（可选）</label
          ><select id="audio-familiarity" v-model="form.audioFamiliarity">
            <option value="unknown">不确定</option>
            <option value="low">没什么印象</option>
            <option value="medium">有点熟，可能听过</option>
            <option value="high">很熟，听到就认出来</option>
          </select>
        </div>
        <div class="field">
          <label for="relevance">最近可能用到吗（可选）</label
          ><select id="relevance" v-model="form.personalRelevance">
            <option value="unknown">说不准</option>
            <option value="high">很可能会用到</option>
            <option value="medium">也许会用到</option>
            <option value="low">暂时不会用到</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <span class="page-subtitle form-note">不确定也可以记录，之后再补充</span
        ><button class="button" type="submit" :disabled="submitting">
          {{ submitting ? "记录中…" : "记录并分析" }}
        </button>
      </div>
    </form>

    <AppState
      v-if="submitError"
      kind="error"
      title="录入没有同步"
      :message="submitError"
      style="margin-top: 22px"
    />
    <AppState
      v-if="queuedOffline"
      kind="offline"
      title="录入已在本机暂存"
      message="这条录入尚未写入 D1，也不会提前改变词汇状态；恢复网络后会自动重试。"
      style="margin-top: 22px"
    />
    <AppState
      v-if="queuedSynced"
      kind="success"
      title="离线录入已同步"
      message="事件已按原始 clientEventId 写入服务端；词汇状态由服务端重新判定。"
      style="margin-top: 22px"
    />

    <section
      v-if="result"
      class="card card__body result-panel"
      aria-live="polite"
    >
      <div class="result-panel__head">
        <div>
          <p class="eyebrow">录入结果</p>
          <h2>
            {{ result.word.wordDisplay }} ·
            {{ classificationLabels[result.decision.classification] }}
          </h2>
        </div>
        <span
          class="status-chip"
          :class="`status-chip--${result.decision.container}`"
          >{{ containerLabels[result.decision.container] }}</span
        >
      </div>
      <p
        v-if="result.decision.activationBlockedByDebt"
        class="notice notice--warning"
      >
        主动池超过 15，这个词已安全留在候选箱；今天不会增加新任务。
      </p>
      <p v-if="result.decision.needsClarification" class="notice">
        不确定没关系，先按保守状态记录；下次只听声音时再确认即可。
      </p>
      <p v-if="result.decision.nextSkill === 'review-evaluator'" class="notice">
        这是已有词条，本次遇见已追加记录，不需要重新创建语义卡。
      </p>
      <ul class="reason-list">
        <li v-for="reason in result.decision.admissionReasons" :key="reason">
          {{ reason }}
        </li>
      </ul>
    </section>

    <form
      v-if="result?.decision.admit && cardForm && !cardSaved && !cardDeferred"
      class="card card__body card-editor"
      @submit.prevent="saveCard"
    >
      <div>
        <p class="eyebrow">SEMANTIC CARD</p>
        <h2>确认这次语境里的意思</h2>
        <p class="page-subtitle">
          系统已经准备好一份最小草稿。你只需确认这次语境里的意思；不确定或资料不全时，可以稍后补全。
        </p>
      </div>
      <div class="form-grid">
        <div
          v-if="cardForm.senseOptions.length > 1"
          class="field form-grid__full"
        >
          <label for="sense">这次更接近哪个意思？</label>
          <select
            id="sense"
            :value="cardForm.selectedSenseIndex ?? 0"
            @change="handleSenseChange"
          >
            <option
              v-for="(sense, index) in cardForm.senseOptions"
              :key="`${sense.definitionEn}-${index}`"
              :value="index"
            >
              {{ sense.definitionZh || sense.definitionEn }}
            </option>
          </select>
          <span class="field-hint"
            >系统已根据上下文预选；不确定时可保留第一项。</span
          >
        </div>
        <div class="field form-grid__full">
          <label for="meaning-en">核心意思（系统建议，可修改）</label
          ><input
            id="meaning-en"
            v-model="cardForm.coreMeaningEn"
            maxlength="500"
          />
        </div>
        <div class="field form-grid__full">
          <label for="meaning-zh">中文桥接（系统建议，可修改）</label
          ><input
            id="meaning-zh"
            v-model="cardForm.coreMeaningZh"
            maxlength="200"
          />
        </div>
        <div class="field form-grid__full">
          <label for="anchor">例句（优先使用真实上下文）</label
          ><textarea
            id="anchor"
            v-model="cardForm.anchorSentence"
            maxlength="1000"
          />
        </div>
        <div class="field form-grid__full">
          <label for="scene">记忆画面（系统已生成，可修改）</label
          ><textarea
            id="scene"
            v-model="cardForm.semanticScene"
            maxlength="1000"
          />
        </div>
        <p v-if="!cardComplete" class="field-hint form-grid__full">
          目前资料还不完整，可以直接点“稍后补全”，不会影响这次录入。
        </p>
      </div>
      <details class="card-editor__advanced">
        <summary>发音与听音设置（高级，可不填）</summary>
        <div class="form-grid">
          <div class="field">
            <label for="pronunciation">发音</label
            ><input
              id="pronunciation"
              v-model="cardForm.pronunciation"
              placeholder="没有可靠数据则留空"
            />
          </div>
          <div class="field">
            <label for="audio-url">音频 URL</label
            ><input id="audio-url" v-model="cardForm.audioUrl" type="url" />
          </div>
          <div class="field form-grid__full">
            <label for="prompt">听音回忆提示</label
            ><input
              id="prompt"
              v-model="cardForm.retrievalPrompt"
              maxlength="300"
            />
          </div>
        </div>
      </details>
      <div class="form-actions">
        <button class="button button--text" type="button" @click="deferCard">
          稍后补全
        </button>
        <button
          class="button"
          type="submit"
          :disabled="savingCard || !cardComplete"
        >
          {{ savingCard ? "保存中…" : "确认并保存语义卡" }}
        </button>
      </div>
    </form>

    <AppState
      v-if="result?.decision.admit && cardDeferred && !cardSaved"
      kind="success"
      title="已先记录单词"
      message="语义卡不会阻塞录入；之后可以从语义卡页面继续补全。"
      style="margin-top: 22px"
      ><NuxtLink
        class="button button--tonal"
        :to="`/cards?create=${result.word.id}`"
        >稍后去补全</NuxtLink
      ></AppState
    >

    <AppState
      v-if="cardSaved"
      kind="success"
      title="语义卡已保存"
      message="它现在可以进入音频优先的检索练习。"
      style="margin-top: 22px"
      ><NuxtLink class="button button--tonal" to="/cards"
        >查看词卡</NuxtLink
      ></AppState
    >
  </div>
</template>
