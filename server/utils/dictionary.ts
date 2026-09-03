import { DictionaryService } from "../services/dictionary";
import type { H3Event } from "h3";

export function useDictionaryService(event: H3Event): DictionaryService {
  const config = useRuntimeConfig();
  return new DictionaryService({
    dictionaryDb: getDictionaryDb(event),
    uapisBaseUrl: config.uapisBaseUrl || null,
    uapisApiKey: config.uapisApiKey || null,
    youdaoBaseUrl: config.youdaoBaseUrl || null,
    timeoutMs: Number(config.dictionaryTimeoutMs),
  });
}
