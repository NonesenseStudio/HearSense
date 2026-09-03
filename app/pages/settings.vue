<script setup lang="ts">
import type { DictionaryHealth } from "~~/shared/types/dictionary";
import type { AppSettings } from "~~/shared/types/vocabulary";

useSeoMeta({ title: "设置" });

const { settings, save } = useLearningSettings();
const form = ref<AppSettings>({ ...settings.value });
const saved = shallowRef(false);
const { online, queue, syncing, lastSyncAt, flush } = useOfflineQueue();
const { $pwa } = useNuxtApp();
const locking = shallowRef(false);
const lockError = shallowRef<string | null>(null);
const {
  data: healthResponse,
  status: healthStatus,
  error: healthError,
  refresh: refreshHealth,
} = await useFetch<{ data: DictionaryHealth }>("/api/dictionary/health");

onMounted(() => {
  form.value = { ...settings.value };
});

function saveSettings() {
  save(form.value);
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 2400);
}

async function installPwa() {
  await $pwa?.install();
}

async function lockApp() {
  if (locking.value) return;
  locking.value = true;
  lockError.value = null;
  try {
    await $fetch("/api/access/logout", { method: "POST" });
    await navigateTo(
      { path: "/access", query: { locked: "1" } },
      { replace: true },
    );
  } catch (cause) {
    lockError.value =
      cause instanceof Error ? cause.message : "锁定失败，请重试。";
  } finally {
    locking.value = false;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">PREFERENCES</p>
        <h1>学习与同步设置</h1>
        <p class="page-subtitle">
          控制每日时长、音频体验、PWA 安装和离线事件状态。
        </p>
      </div>
    </header>

    <form class="card card__body settings-form" @submit.prevent="saveSettings">
      <div class="form-grid">
        <div class="field">
          <label for="duration">默认每日学习时长</label
          ><select id="duration" v-model.number="form.dailyMinutes">
            <option :value="20">20 分钟</option>
            <option :value="15">15 分钟</option>
            <option :value="10">10 分钟</option>
            <option :value="5">5 分钟</option></select
          ><small>新词仍由主动池动态限制，不是每日配额。</small>
        </div>
        <div class="field">
          <label for="speed">音频播放速度</label
          ><select id="speed" v-model.number="form.audioSpeed">
            <option :value="0.75">0.75×</option>
            <option :value="1">1.0×</option>
            <option :value="1.25">1.25×</option>
          </select>
        </div>
        <label class="toggle-row form-grid__full"
          ><span
            ><strong>进入音频题时自动播放</strong
            ><small>浏览器可能在首次播放前要求一次手动交互。</small></span
          ><input v-model="form.autoplayAudio" type="checkbox" role="switch"
        /></label>
      </div>
      <div class="form-actions">
        <span v-if="saved" class="success-text" role="status">已保存到本机</span
        ><button class="button" type="submit">保存设置</button>
      </div>
    </form>

    <section
      class="card card__body security-panel"
      aria-labelledby="security-title"
    >
      <div>
        <p class="eyebrow">PRIVATE ACCESS</p>
        <h2 id="security-title">访问保护</h2>
        <p class="page-subtitle">
          暂时离开时锁定应用；锁定后会清除当前浏览器的访问 Cookie。
        </p>
      </div>
      <div class="form-actions">
        <span v-if="lockError" class="field-error" role="alert">{{
          lockError
        }}</span>
        <button
          class="button button--tonal"
          type="button"
          :disabled="locking"
          @click="lockApp"
        >
          {{ locking ? "锁定中…" : "锁定应用" }}
        </button>
      </div>
    </section>

    <section class="settings-grid">
      <article class="card card__body status-panel">
        <p class="eyebrow">OFFLINE & SYNC</p>
        <h2>数据同步</h2>
        <dl class="settings-status">
          <div>
            <dt>网络</dt>
            <dd>{{ online ? "在线" : "离线" }}</dd>
          </div>
          <div>
            <dt>本地待同步</dt>
            <dd>{{ queue.length }} 条</dd>
          </div>
          <div>
            <dt>最近同步</dt>
            <dd>
              {{
                lastSyncAt
                  ? new Date(lastSyncAt).toLocaleString("zh-CN")
                  : "本次尚无"
              }}
            </dd>
          </div>
        </dl>
        <p v-if="!online" class="notice notice--warning">
          离线事件仅保存在此设备，尚未写入 D1；恢复网络后才会尝试同步。
        </p>
        <p
          v-else-if="queue.some((item) => item.lastError)"
          class="notice notice--warning"
        >
          队列中有事件同步失败，将保留在本机等待重试。
        </p>
        <button
          class="button button--tonal"
          type="button"
          :disabled="!online || syncing || queue.length === 0"
          @click="flush"
        >
          {{ syncing ? "同步中…" : "立即同步" }}
        </button>
      </article>

      <article class="card card__body status-panel">
        <p class="eyebrow">INSTALL</p>
        <h2>安装听义</h2>
        <p class="page-subtitle">
          安装后可从桌面启动；已访问的应用页面、词卡和近期分析可从缓存打开。
        </p>
        <p v-if="$pwa?.isPWAInstalled" class="success-text">
          当前已作为 PWA 安装
        </p>
        <button
          v-else-if="$pwa?.showInstallPrompt"
          class="button button--tonal"
          type="button"
          @click="installPwa"
        >
          安装应用
        </button>
        <p v-else class="form-note">
          当前浏览器暂未提供安装提示，可使用浏览器菜单中的“安装应用”。
        </p>
      </article>

      <article class="card card__body status-panel settings-grid__full">
        <div class="status-panel__head">
          <div>
            <p class="eyebrow">DICTIONARY API</p>
            <h2>词典服务</h2>
          </div>
          <button
            class="button button--text"
            type="button"
            :disabled="healthStatus === 'pending'"
            @click="() => refreshHealth()"
          >
            重新检查
          </button>
        </div>
        <AppState
          v-if="healthStatus === 'pending'"
          kind="loading"
          title="正在检查"
          message="通过统一服务端接口检查词典连接。"
        />
        <AppState
          v-else-if="healthError"
          kind="error"
          title="检查失败"
          :message="healthError.message"
        />
        <AppState
          v-else-if="
            healthResponse?.data.available &&
            healthResponse.data.status === 'ok'
          "
          kind="success"
          title="词典服务可用"
          :message="`检查时间：${new Date(healthResponse.data.checkedAt).toLocaleString('zh-CN')}`"
        />
        <AppState
          v-else-if="healthResponse?.data.available"
          kind="error"
          title="词典服务部分可用"
          :message="
            healthResponse?.data.detail ??
            'ECDICT、uapis 或有道当前处于降级状态；录入仍可继续。'
          "
        />
        <AppState
          v-else
          kind="error"
          title="词典服务当前不可用"
          :message="
            healthResponse?.data.detail ??
            '没有可用详情；录入仍可继续，发音与释义不会被伪造。'
          "
        />
        <dl
          v-if="healthResponse?.data.providers"
          class="settings-status dictionary-provider-status"
        >
          <div>
            <dt>ECDICT</dt>
            <dd>
              {{
                healthResponse.data.providers.ecdict.available
                  ? `${healthResponse.data.providers.ecdict.entries ?? "未知"} 条`
                  : "未就绪"
              }}
            </dd>
          </div>
          <div>
            <dt>uapis</dt>
            <dd>
              {{
                healthResponse.data.providers.uapis.configured
                  ? "已配置，按需回退"
                  : "未配置"
              }}
            </dd>
          </div>
          <div>
            <dt>有道发音</dt>
            <dd>
              {{
                healthResponse.data.providers.youdao.configured
                  ? "已配置，按需代理"
                  : "未配置"
              }}
            </dd>
          </div>
        </dl>
      </article>
    </section>
  </div>
</template>
