<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name:
      | "home"
      | "add"
      | "inbox"
      | "card"
      | "review"
      | "progress"
      | "settings"
      | "menu"
      | "close"
      | "arrow"
      | "volume"
      | "cloud-off"
      | "check"
      | "clock"
      | "brain";
    size?: number;
  }>(),
  {
    size: 24,
  },
);

const paths: Record<typeof props.name, string> = {
  home: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z",
  add: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  inbox: "M4 4h16l2 9v7H2v-7l2-9Zm1.6 2-1.5 7H8l2 3h4l2-3h3.9l-1.5-7H5.6Z",
  card: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm3 2v2h10V7H7Zm0 5v2h7v-2H7Z",
  review:
    "M12 3a9 9 0 1 1-8.5 6h2.2A7 7 0 1 0 7 6.1L10 9H3V2l2.6 2.6A9 9 0 0 1 12 3Z",
  progress: "M4 19h16v2H2V3h2v16Zm3-2v-6h3v6H7Zm5 0V7h3v10h-3Zm5 0v-4h3v4h-3Z",
  settings:
    "m19.4 13 .1-1-.1-1 2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L16 2h-4l-.4 2.4a8 8 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5-.2 2 .2 1.2-2 1.5 2 3.5 2.3-1a8 8 0 0 0 1.7 1L12 20h4l.4-2.4a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5ZM14 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
  menu: "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z",
  close:
    "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z",
  arrow: "m13 5 7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z",
  volume:
    "M4 9v6h4l5 4V5L8 9H4Zm12.5-1.5a6 6 0 0 1 0 9L15 15a4 4 0 0 0 0-6l1.5-1.5Zm3-3a10 10 0 0 1 0 15L18 18a8 8 0 0 0 0-12l1.5-1.5Z",
  "cloud-off":
    "m5 4 15 15-1.4 1.4-2.2-2.2H6a4 4 0 0 1-.6-8A7 7 0 0 1 6 7.6L3.6 5.4 5 4Zm15.6 12.8-2-2A4 4 0 0 0 17 7.3 7 7 0 0 0 7.7 5l1.6 1.6A5 5 0 0 1 16 11v.5h1a2 2 0 0 1 2 2c0 .5-.1.9-.4 1.3l2 2Z",
  check: "m9.2 16.2-4.4-4.4L3.4 13.2 9.2 19 21 7.2l-1.4-1.4-10.4 10.4Z",
  clock:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 3v4.6l3.2 3.2-1.4 1.4L11 12.4V7h2Z",
  brain:
    "M9 3a3 3 0 0 0-3 3v.2A3.5 3.5 0 0 0 4.5 12 3.5 3.5 0 0 0 6 17.8V18a3 3 0 0 0 5 2.2V3.8A3 3 0 0 0 9 3Zm6 0a3 3 0 0 1 3 3v.2a3.5 3.5 0 0 1 1.5 5.8 3.5 3.5 0 0 1-1.5 5.8v.2a3 3 0 0 1-5 2.2V3.8A3 3 0 0 1 15 3Z",
};
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>
