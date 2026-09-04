<script setup lang="ts">
definePageMeta({ layout: false });
useSeoMeta({ title: "访问验证" });

interface AccessStatusResponse {
  data: {
    configured: boolean;
    authenticated: boolean;
    sessionExpiresAt: string | null;
  };
}

const route = useRoute();
const password = shallowRef("");
const submitting = shallowRef(false);
const loginError = shallowRef<string | null>(null);
const redirectPath = computed(() => {
  const value = route.query.redirect;
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/";
  return value;
});
const locked = computed(() => route.query.locked === "1");

const {
  data: accessResponse,
  status: accessStatus,
  error: accessError,
} = await useFetch<AccessStatusResponse>("/api/access/status", {
  key: "access-status",
});

async function submit() {
  if (!password.value || submitting.value) return;
  submitting.value = true;
  loginError.value = null;
  try {
    await $fetch("/api/access/login", {
      method: "POST",
      body: { password: password.value },
    });
    password.value = "";
    await navigateTo(redirectPath.value, { replace: true });
  } catch (cause) {
    const error = cause as { data?: { message?: string } };
    loginError.value =
      error.data?.message ?? "无法解锁，请检查密码或稍后重试。";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="access-page">
    <section class="access-card card" aria-labelledby="access-title">
      <div class="access-brand" aria-hidden="true">
        <span class="brand__mark"><AppIcon name="volume" :size="22" /></span>
        <span><strong>听义</strong><small>HearSense</small></span>
      </div>
      <p class="eyebrow">PRIVATE APP</p>
      <h1 id="access-title">这是一个私人空间</h1>
      <p class="page-subtitle">
        请输入访问密码。学习数据只对授权用户开放，不会通过公开接口提供。
      </p>

      <p v-if="locked" class="notice" role="status">应用已锁定。</p>
      <p v-if="accessStatus === 'pending'" class="access-status" role="status">
        正在检查访问保护…
      </p>
      <p v-else-if="accessError" class="notice notice--warning" role="alert">
        暂时无法检查访问保护，请确认服务已启动后重试。
      </p>
      <p
        v-else-if="!accessResponse?.data.configured"
        class="notice notice--warning"
        role="alert"
      >
        尚未配置访问密码。请先在 D1 中初始化 8 位访问密码，然后重新加载。
      </p>
      <form v-else class="access-form" @submit.prevent="submit">
        <div class="field">
          <label for="access-password">访问密码</label>
          <input
            id="access-password"
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            minlength="8"
            maxlength="8"
            required
            autofocus
          />
        </div>
        <p v-if="loginError" class="field-error" role="alert">
          {{ loginError }}
        </p>
        <button
          class="button access-form__submit"
          type="submit"
          :disabled="submitting"
        >
          {{ submitting ? "验证中…" : "解锁听义" }}
        </button>
      </form>
      <p class="access-note">
        会话使用 HttpOnly Cookie 保存，退出后需要重新输入密码。
      </p>
    </section>
  </main>
</template>
