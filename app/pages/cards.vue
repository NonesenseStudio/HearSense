<script setup lang="ts">
import type { SemanticCardDraft } from "~~/shared/domain/semantic-card";
import type { SemanticCard, WordRecord } from "~~/shared/types/vocabulary";

useSeoMeta({ title: "语义卡片" });

interface CardItem {
  word: WordRecord;
  card: SemanticCard;
}
interface CardsResponse {
  data: { items: CardItem[] };
}
interface DraftResponse {
  data: { word: WordRecord; draft: SemanticCardDraft };
}

const route = useRoute();
const createId =
  typeof route.query.create === "string" ? route.query.create : null;
const {
  data: cardsResponse,
  status,
  error,
  refresh,
} = await useFetch<CardsResponse>("/api/cards");
const draftResponse = shallowRef<DraftResponse | null>(null);
const draftError = shallowRef<string | null>(null);
const cardForm = ref<SemanticCardDraft | null>(null);
const saving = shallowRef(false);

function errorMessage(cause: unknown): string {
  const value = cause as {
    data?: { message?: string };
    message?: string;
  } | null;
  return value?.data?.message ?? value?.message ?? "请求失败，请稍后重试。";
}

if (createId) {
  try {
    draftResponse.value = await $fetch<DraftResponse>(
      `/api/words/${createId}/card-draft`,
    );
    cardForm.value = { ...draftResponse.value.data.draft };
  } catch (cause) {
    draftError.value = errorMessage(cause);
  }
}

async function saveCard() {
  if (!createId || !cardForm.value) return;
  saving.value = true;
  draftError.value = null;
  try {
    await $fetch(`/api/words/${createId}/cards`, {
      method: "POST",
      body: cardForm.value,
    });
    cardForm.value = null;
    await refresh();
    await navigateTo("/cards");
  } catch (cause) {
    draftError.value = errorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SEMANTIC CARDS</p>
        <h1>语义卡片</h1>
        <p class="page-subtitle">
          声音先行；每张卡只呈现一个核心语义，不把词典全部义项倒在首屏。
        </p>
      </div>
    </header>

    <AppState
      v-if="draftError"
      kind="error"
      title="无法准备语义卡"
      :message="draftError"
    />
    <form
      v-if="draftResponse && cardForm"
      class="card card__body card-editor"
      @submit.prevent="saveCard"
    >
      <div>
        <p class="eyebrow">
          新建语义卡 · {{ draftResponse.data.word.wordDisplay }}
        </p>
        <h2>确认最小语义锚点</h2>
        <p class="page-subtitle">
          真实上下文已优先填入；外部服务不可用时，请补全空白字段。
        </p>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="pronunciation">发音（可空）</label
          ><input
            id="pronunciation"
            v-model="cardForm.pronunciation"
            placeholder="没有可靠数据则留空"
          />
        </div>
        <div class="field">
          <label for="audio-url">音频 URL（可空）</label
          ><input id="audio-url" v-model="cardForm.audioUrl" type="url" />
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
          <label for="scene">一个具体场景 *</label
          ><textarea
            id="scene"
            v-model="cardForm.semanticScene"
            required
            maxlength="1000"
          />
        </div>
        <div class="field form-grid__full">
          <label for="prompt">听音提示 *</label
          ><input
            id="prompt"
            v-model="cardForm.retrievalPrompt"
            required
            maxlength="300"
          />
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? "保存中…" : "保存并进入复习池" }}
        </button>
      </div>
    </form>

    <AppState
      v-if="status === 'pending'"
      kind="loading"
      title="正在读取词卡"
      message="加载已保存的核心语义。"
    />
    <AppState
      v-else-if="error"
      kind="error"
      title="无法读取语义卡"
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
      v-else-if="!cardsResponse?.data.items.length && !cardForm"
      title="还没有主动词卡"
      message="被录入流程判定为 L1 或 L2 的高价值词会出现在这里。"
      ><NuxtLink class="button button--tonal" to="/intake"
        >去录入</NuxtLink
      ></AppState
    >
    <section
      v-else-if="cardsResponse?.data.items.length"
      class="semantic-grid"
      aria-label="语义卡片列表"
    >
      <article
        v-for="item in cardsResponse.data.items"
        :key="item.card.id"
        class="semantic-card card"
      >
        <div class="semantic-card__top">
          <div>
            <span class="status-chip">{{ item.word.state }}</span>
            <h2>{{ item.word.wordDisplay }}</h2>
            <p v-if="item.card.pronunciation" class="pronunciation">
              {{ item.card.pronunciation }}
            </p>
          </div>
          <AudioButton :word="item.word.word" :audio-url="item.card.audioUrl" />
        </div>
        <div class="meaning-block">
          <strong>{{ item.card.coreMeaningEn }}</strong
          ><span>{{ item.card.coreMeaningZh }}</span>
        </div>
        <blockquote>{{ item.card.anchorSentence }}</blockquote>
        <div class="scene-block">
          <span>想象场景</span>
          <p>{{ item.card.semanticScene }}</p>
        </div>
        <dl class="source-meta">
          <div>
            <dt>来源</dt>
            <dd>{{ item.word.source ?? "未说明" }}</dd>
          </div>
          <div>
            <dt>例句</dt>
            <dd>
              {{
                item.card.exampleOrigin === "learner_source"
                  ? "用户真实上下文"
                  : "系统草稿，经用户确认"
              }}
            </dd>
          </div>
        </dl>
        <NuxtLink
          class="button button--tonal"
          :to="`/review?word=${item.word.id}`"
          >开始听音检索 <AppIcon name="arrow" :size="18"
        /></NuxtLink>
      </article>
    </section>
  </div>
</template>
