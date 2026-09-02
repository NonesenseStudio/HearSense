import { DictionaryService } from "../services/dictionary";

export function useDictionaryService(): DictionaryService {
  const config = useRuntimeConfig();
  return new DictionaryService(
    config.dictionaryBaseUrl,
    config.dictionaryTimeoutMs,
  );
}
