<script setup lang="ts">
import type { WordRecord } from "~~/shared/types/vocabulary";

useSeoMeta({ title: "候选词" });

interface CandidateItem {
  word: WordRecord;
  priority: number | null;
  admissionReasons: string[];
  activationBlockedByDebt: boolean;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  deferredUntil: string | null;
  status: "pending" | "deferred" | "activated";
}
interface CandidateResponse {
  data: {
    items: CandidateItem[];
    activeReviewCount: number;
    activationBlocked: boolean;
  };
}

const learningStateLabels: Record<WordRecord["state"], string> = {
  L0: "暂不熟悉",
  L1: "声音熟、词义不稳",
  L2: "词义想得慢",
  L3: "听到即懂",
  L4: "能够自然使用",
};

const {
  data: response,
  status,
  error,
  refresh,
} = await useFetch<CandidateResponse>("/api/candidates");
const actionId = shallowRef<string | null>(null);
const actionError = shallowRef<string | null>(null);

function errorMessage(cause: unknown): string {
  const value = cause as {
    data?: { message?: string };
    message?: string;
  } | null;
  return value?.data?.message ?? value?.message ?? "操作失败，请稍后重试。";
}

async function activate(item: CandidateItem) {
  actionId.value = item.word.id;
  actionError.value = null;
  try {
    await $fetch(`/api/candidates/${item.word.id}/activate`, {
      method: "POST",
    });
    await navigateTo(`/cards?create=${item.word.id}`);
  } catch (cause) {
    actionError.value = errorMessage(cause);
  } finally {
    actionId.value = null;
  }
}

async function defer(item: CandidateItem) {
  actionId.value = item.word.id;
  actionError.value = null;
  try {
    await $fetch(`/api/candidates/${item.word.id}/defer`, {
      method: "POST",
      body: { until: null },
    });
    await refresh();
  } catch (cause) {
    actionError.value = errorMessage(cause);
  } finally {
    actionId.value = null;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CANDIDATE INBOX</p>
        <h1>候选词箱</h1>
        <p class="page-subtitle">
          候选不是待清空的任务。需要时手动激活，也可以安心延后。
        </p>
      </div>
      <div v-if="response" class="pool-indicator">
        <strong>{{ response.data.activeReviewCount }}</strong
        ><span>主动复习词</span>
      </div>
    </header>

    <AppState
      v-if="status === 'pending'"
      kind="loading"
      title="正在读取候选词"
      message="只读取真实持久化记录。"
    />
    <AppState
      v-else-if="error"
      kind="error"
      title="无法读取候选箱"
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
      v-else-if="!response?.data.items.length"
      title="候选箱为空"
      message="陌生词不会仅因罕见或高级而自动进入主动复习。"
      ><NuxtLink class="button button--tonal" to="/intake"
        >录入单词</NuxtLink
      ></AppState
    >
    <template v-else>
      <p v-if="response.data.activationBlocked" class="notice notice--warning">
        主动复习池超过 15，激活已暂停。修复弱词后再决定是否加入新词。
      </p>
      <AppState
        v-if="actionError"
        kind="error"
        title="操作未完成"
        :message="actionError"
      />
      <section class="candidate-list" aria-label="候选词列表">
        <article
          v-for="item in response.data.items"
          :key="item.word.id"
          class="card candidate-row"
        >
          <div class="candidate-row__word">
            <span class="status-chip">{{
              learningStateLabels[item.word.state]
            }}</span>
            <h2>{{ item.word.wordDisplay }}</h2>
            <small>优先级 {{ item.priority ?? "未计算" }}</small>
          </div>
          <div class="candidate-row__context">
            <p v-if="item.word.sourceContext">
              “{{ item.word.sourceContext }}”
            </p>
            <ul class="reason-list">
              <li v-for="reason in item.admissionReasons" :key="reason">
                {{ reason }}
              </li>
            </ul>
            <p v-if="item.needsClarification" class="notice">
              录入时对此词的听音理解还不确定，系统会先保守放在候选箱。
            </p>
          </div>
          <div class="candidate-row__actions">
            <button
              class="button button--text"
              type="button"
              :disabled="actionId === item.word.id"
              @click="defer(item)"
            >
              延后
            </button>
            <button
              class="button button--tonal"
              type="button"
              :disabled="
                actionId === item.word.id || response.data.activationBlocked
              "
              @click="activate(item)"
            >
              激活
            </button>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>
