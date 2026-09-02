<script setup lang="ts">
withDefaults(
  defineProps<{
    kind?: "empty" | "loading" | "error" | "offline" | "success";
    title: string;
    message: string;
  }>(),
  {
    kind: "empty",
  },
);
</script>

<template>
  <section
    class="state-card"
    :class="`state-card--${kind}`"
    role="status"
    aria-live="polite"
  >
    <div class="state-card__icon">
      <span v-if="kind === 'loading'" class="spinner" aria-hidden="true" />
      <AppIcon
        v-else-if="kind === 'error' || kind === 'offline'"
        name="cloud-off"
        :size="28"
      />
      <AppIcon v-else-if="kind === 'success'" name="check" :size="28" />
      <AppIcon v-else name="brain" :size="28" />
    </div>
    <div>
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <slot />
    </div>
  </section>
</template>
