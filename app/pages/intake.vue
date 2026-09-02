<script setup lang="ts">
import type { SemanticCardDraft } from "~~/shared/domain/semantic-card";
import type {
  IntakeDecision,
  SemanticCard,
  WordRecord,
} from "~~/shared/types/vocabulary";

useSeoMeta({ title: "录入单词" });

interface IntakeResponse {
  data: {
    word: WordRecord;
    decision: IntakeDecision;
    cardDraft: SemanticCardDraft | null;
    activeReviewCountBefore: number;
  };
}

const form = ref({
  word: "",
  source: "" as "" | WordRecord["source"],
  sourceContext: "",
  learnerReport: "",
  encounterCount: 1,
  heardBefore: "unknown" as "unknown" | "yes" | "no",
  seenBefore: "unknown" as "unknown" | "yes" | "no",
  meaningRecall: "unknown" as "none" | "vague" | "slow" | "instant" | "unknown",
  audioFamiliarity: "unknown" as WordRecord["audioFamiliarity"],
  personalRelevance: "unknown" as WordRecord["personalRelevance"],
});
const submitting = shallowRef(false);
const submitError = shallowRef<string | null>(null);
const result = shallowRef<IntakeResponse["data"] | null>(null);
const cardForm = ref<SemanticCardDraft | null>(null);
const savingCard = shallowRef(false);
const cardSaved = shallowRef<SemanticCard | null>(null);
const queuedOffline = shallowRef(false);
const queuedSynced = shallowRef(false);
const queuedClientEventId = shallowRef<string | null>(null);
const { queue, enqueue } = useOfflineQueue();

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

async function submit() {
  submitting.value = true;
  submitError.value = null;
  result.value = null;
  queuedOffline.value = false;
  queuedSynced.value = false;
  queuedClientEventId.value = null;
  cardSaved.value = null;
  const payload = {
    clientEventId: crypto.randomUUID(),
    word: form.value.word,
    source: form.value.source || null,
    sourceContext: form.value.sourceContext || null,
    learnerReport: form.value.learnerReport || null,
    encounterCount: form.value.encounterCount,
    heardBefore:
      form.value.heardBefore === "unknown"
        ? null
        : form.value.heardBefore === "yes",
    seenBefore:
      form.value.seenBefore === "unknown"
        ? null
        : form.value.seenBefore === "yes",
    meaningRecall: form.value.meaningRecall,
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
  if (!result.value || !cardForm.value) return;
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
          系统关注这个词与你的真实关系，而不是它看起来有多高级。信息不够时只会追问一个问题。
        </p>
      </div>
    </header>

    <form class="card card__body" @submit.prevent="submit">
      <div class="form-grid">
        <div class="field">
          <label for="word">英文单词或短语 *</label
          ><input
            id="word"
            v-model="form.word"
            required
            type="text"
            maxlength="100"
            autocomplete="off"
            spellcheck="false"
            placeholder="例如 astonish"
          />
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
          <label for="context">原始句子或场景</label
          ><textarea
            id="context"
            v-model="form.sourceContext"
            maxlength="2000"
            placeholder="尽量保留当时听到或看到的上下文"
          />
        </div>
        <div class="field form-grid__full">
          <label for="report">你当时的感受</label
          ><textarea
            id="report"
            v-model="form.learnerReport"
            maxlength="1000"
            placeholder="例如：声音很熟，但完全想不起意思"
          />
        </div>
        <div class="field">
          <label for="encounters">大约遇到次数</label
          ><input
            id="encounters"
            v-model.number="form.encounterCount"
            type="number"
            min="0"
            max="10000"
          />
        </div>
        <div class="field">
          <label for="meaning">含义回忆情况 *</label
          ><select id="meaning" v-model="form.meaningRecall" required>
            <option value="unknown">还不确定</option>
            <option value="none">想不起来</option>
            <option value="vague">只有模糊感觉</option>
            <option value="slow">能想起，但超过约 2 秒</option>
            <option value="instant">听到后立即理解</option>
          </select>
        </div>
        <div class="field">
          <label for="heard">以前听过吗</label
          ><select id="heard" v-model="form.heardBefore">
            <option value="unknown">不确定</option>
            <option value="yes">听过</option>
            <option value="no">没听过</option>
          </select>
        </div>
        <div class="field">
          <label for="seen">以前见过拼写吗</label
          ><select id="seen" v-model="form.seenBefore">
            <option value="unknown">不确定</option>
            <option value="yes">见过</option>
            <option value="no">没见过</option>
          </select>
        </div>
        <div class="field">
          <label for="audio-familiarity">声音熟悉度</label
          ><select id="audio-familiarity" v-model="form.audioFamiliarity">
            <option value="unknown">不确定</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div class="field">
          <label for="relevance">个人相关性</label
          ><select id="relevance" v-model="form.personalRelevance">
            <option value="unknown">不确定</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <span class="page-subtitle form-note">L0 不会仅因生僻而自动激活</span
        ><button class="button" type="submit" :disabled="submitting">
          {{ submitting ? "分析中…" : "分析并录入" }}
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
            {{ result.word.wordDisplay }} · {{ result.decision.classification }}
          </h2>
        </div>
        <span
          class="status-chip"
          :class="`status-chip--${result.decision.container}`"
          >{{ result.decision.container }}</span
        >
      </div>
      <p
        v-if="result.decision.activationBlockedByDebt"
        class="notice notice--warning"
      >
        主动池超过 15，这个词已安全留在候选箱；今天不会增加新任务。
      </p>
      <p v-if="result.decision.needsClarification" class="notice">
        <strong>需要确认：</strong>{{ result.decision.clarifyingQuestion }}
      </p>
      <ul class="reason-list">
        <li v-for="reason in result.decision.admissionReasons" :key="reason">
          {{ reason }}
        </li>
      </ul>
    </section>

    <form
      v-if="result?.decision.admit && cardForm && !cardSaved"
      class="card card__body card-editor"
      @submit.prevent="saveCard"
    >
      <div>
        <p class="eyebrow">SEMANTIC CARD</p>
        <h2>完成一个最小语义锚点</h2>
        <p class="page-subtitle">
          外部服务缺失的字段保持空白，请确认后保存。页面不会展开所有词典义项。
        </p>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="pronunciation">发音（没有则留空）</label
          ><input
            id="pronunciation"
            v-model="cardForm.pronunciation"
            placeholder="不自行补造 IPA"
          />
        </div>
        <div class="field">
          <label for="audio-url">音频 URL（可选）</label
          ><input
            id="audio-url"
            v-model="cardForm.audioUrl"
            type="url"
            placeholder="https://…"
          />
        </div>
        <div class="field form-grid__full">
          <label for="meaning-en">一个核心英文含义 *</label
          ><input
            id="meaning-en"
            v-model="cardForm.coreMeaningEn"
            required
            maxlength="500"
          />
        </div>
        <div class="field form-grid__full">
          <label for="meaning-zh">简洁中文桥接 *</label
          ><input
            id="meaning-zh"
            v-model="cardForm.coreMeaningZh"
            required
            maxlength="200"
          />
        </div>
        <div class="field form-grid__full">
          <label for="anchor">一个自然例句 *</label
          ><textarea
            id="anchor"
            v-model="cardForm.anchorSentence"
            required
            maxlength="1000"
          />
        </div>
        <div class="field form-grid__full">
          <label for="scene">一个可想象的具体场景 *</label
          ><textarea
            id="scene"
            v-model="cardForm.semanticScene"
            required
            maxlength="1000"
          />
        </div>
        <div class="field form-grid__full">
          <label for="prompt">听音回忆提示 *</label
          ><input
            id="prompt"
            v-model="cardForm.retrievalPrompt"
            required
            maxlength="300"
          />
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit" :disabled="savingCard">
          {{ savingCard ? "保存中…" : "保存语义卡" }}
        </button>
      </div>
    </form>

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
