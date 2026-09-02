<script setup lang="ts">
const route = useRoute();
const drawerOpen = shallowRef(false);
const { status: syncStatus } = useOfflineQueue();

const navItems = [
  { to: "/", label: "今日学习", icon: "home" as const },
  { to: "/intake", label: "录入单词", icon: "add" as const },
  { to: "/candidates", label: "候选词", icon: "inbox" as const },
  { to: "/cards", label: "语义卡片", icon: "card" as const },
  { to: "/review", label: "开始复习", icon: "review" as const },
  { to: "/progress", label: "学习进度", icon: "progress" as const },
  { to: "/settings", label: "设置", icon: "settings" as const },
];

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  },
);
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <header class="top-app-bar">
      <button
        class="icon-button top-app-bar__menu"
        type="button"
        aria-label="打开导航"
        @click="drawerOpen = true"
      >
        <AppIcon name="menu" />
      </button>
      <NuxtLink class="brand" to="/">
        <span class="brand__mark"><AppIcon name="volume" :size="22" /></span>
        <span><strong>听义</strong><small>HearSense</small></span>
      </NuxtLink>
      <div
        class="sync-pill"
        :class="`sync-pill--${syncStatus.kind}`"
        :title="syncStatus.label"
      >
        <span class="sync-pill__dot" />
        {{ syncStatus.label }}
      </div>
    </header>

    <div v-if="drawerOpen" class="scrim" @click="drawerOpen = false" />
    <aside
      class="navigation-rail"
      :class="{ 'navigation-rail--open': drawerOpen }"
      aria-label="主导航"
    >
      <div class="navigation-rail__mobile-head">
        <span>学习导航</span>
        <button
          class="icon-button"
          type="button"
          aria-label="关闭导航"
          @click="drawerOpen = false"
        >
          <AppIcon name="close" />
        </button>
      </div>
      <nav>
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item--active': route.path === item.to }"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
      <div class="rail-note">
        <AppIcon name="clock" :size="18" />
        <span>每天最多 20 分钟<br />不累积复习债务</span>
      </div>
    </aside>

    <main id="main-content" class="main-content" tabindex="-1">
      <slot />
    </main>

    <nav class="bottom-navigation" aria-label="移动端快捷导航">
      <NuxtLink
        v-for="item in navItems.slice(0, 5)"
        :key="item.to"
        :to="item.to"
        :aria-label="item.label"
      >
        <AppIcon :name="item.icon" :size="22" />
        <span>{{ item.label.replace("开始", "") }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>
