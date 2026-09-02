import type { AppSettings } from "~~/shared/types/vocabulary";

const STORAGE_KEY = "hearsense:settings:v1";
const DEFAULT_SETTINGS: AppSettings = {
  dailyMinutes: 20,
  autoplayAudio: true,
  audioSpeed: 1,
};

export function useLearningSettings() {
  const settings = useState<AppSettings>("learning-settings", () => ({
    ...DEFAULT_SETTINGS,
  }));
  const loaded = useState("learning-settings-loaded", () => false);

  function load() {
    if (!import.meta.client || loaded.value) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AppSettings>;
        if ([5, 10, 15, 20].includes(parsed.dailyMinutes ?? 0))
          settings.value.dailyMinutes = parsed.dailyMinutes!;
        if (typeof parsed.autoplayAudio === "boolean")
          settings.value.autoplayAudio = parsed.autoplayAudio;
        if ([0.75, 1, 1.25].includes(parsed.audioSpeed ?? 0))
          settings.value.audioSpeed =
            parsed.audioSpeed as AppSettings["audioSpeed"];
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    loaded.value = true;
  }

  function save(next: AppSettings) {
    settings.value = { ...next };
    if (import.meta.client)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  }

  onMounted(load);
  return { settings, loaded, load, save };
}
