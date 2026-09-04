<script setup lang="ts">
import {
  applySemanticSense,
  type SemanticCardDraft,
} from "~~/shared/domain/semantic-card";
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

const learningStateLabels: Record<WordRecord["state"], string> = {
  L0: "暂不熟悉",
  L1: "声音熟、词义不稳",
  L2: "词义想得慢",
  L3: "听到即懂",
  L4: "能够自然使用",
};

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
const cardDeferred = shallowRef(false);

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
    cardDeferred.value = false;
  } catch (cause) {
    draftError.value = errorMessage(cause);
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

function resumeCard() {
  cardDeferred.value = false;
}

async function saveCard() {
  if (!createId || !cardForm.value || !cardComplete.value) return;
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
      v-if="draftResponse && cardForm && !cardDeferred"
      class="card card__body card-editor"
      @submit.prevent="saveCard"
    >
      <div>
        <p class="eyebrow">
          新建语义卡 · {{ draftResponse.data.word.wordDisplay }}
        </p>
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
          目前资料还不完整，可以直接点“稍后补全”，不会影响这次激活。
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
          :disabled="saving || !cardComplete"
        >
          {{ saving ? "保存中…" : "确认并进入复习池" }}
        </button>
      </div>
    </form>

    <AppState
      v-if="draftResponse && cardDeferred"
      kind="success"
      title="已保留激活结果"
      message="语义卡不会阻塞激活；之后可以重新打开这张草稿继续补全。"
      style="margin-bottom: 22px"
      ><NuxtLink
        v-if="draftResponse"
        class="button button--tonal"
        :to="`/cards?create=${draftResponse.data.word.id}`"
        @click="resumeCard"
        >重新打开草稿</NuxtLink
      ></AppState
    >

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
      message="声音熟悉但词义不稳、值得练习的词会出现在这里。"
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
            <span class="status-chip">{{
              learningStateLabels[item.word.state]
            }}</span>
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
