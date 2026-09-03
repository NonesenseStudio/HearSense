<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    word: string;
    audioUrl?: string | null;
    accent?: "uk" | "us";
    label?: string;
    revealWordInLabel?: boolean;
  }>(),
  {
    audioUrl: null,
    accent: "us",
    label: "播放发音",
    revealWordInLabel: true,
  },
);

const playing = shallowRef(false);
const error = shallowRef<string | null>(null);
const { settings } = useLearningSettings();

async function playUrl(url: string) {
  const audio = new Audio(url);
  audio.playbackRate = settings.value.audioSpeed;
  await audio.play();
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("音频加载失败"));
  });
}

async function playSystemSpeech() {
  if (!("speechSynthesis" in window))
    throw new Error("当前设备没有可用的系统语音");
  speechSynthesis.cancel();
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(props.word);
    utterance.lang = "en-US";
    utterance.rate = settings.value.audioSpeed;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("系统语音播放失败"));
    speechSynthesis.speak(utterance);
  });
}

function dictionaryAudioUrl() {
  return `/api/dictionary/audio/${encodeURIComponent(props.word)}?accent=${props.accent}`;
}

async function playDictionaryOrSystemSpeech() {
  try {
    await playUrl(dictionaryAudioUrl());
  } catch {
    await playSystemSpeech();
  }
}

async function play() {
  error.value = null;
  playing.value = true;
  try {
    if (props.audioUrl) {
      try {
        await playUrl(props.audioUrl);
      } catch {
        await playDictionaryOrSystemSpeech();
      }
      return;
    }
    await playDictionaryOrSystemSpeech();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法播放音频";
  } finally {
    playing.value = false;
  }
}

defineExpose({ play });
</script>

<template>
  <div class="audio-control">
    <button
      class="audio-button"
      type="button"
      :disabled="playing"
      :aria-label="revealWordInLabel ? `${label}：${word}` : label"
      @click="play"
    >
      <AppIcon name="volume" :size="25" />
      <span>{{ playing ? "播放中" : label }}</span>
    </button>
    <small v-if="audioUrl">词典音频</small>
    <small v-else>有道音频，失败时使用系统语音</small>
    <small v-if="error" class="field-error" role="alert">{{ error }}</small>
  </div>
</template>
