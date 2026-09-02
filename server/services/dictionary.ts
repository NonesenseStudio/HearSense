import { z } from "zod";
import type {
  DictionaryHealth,
  DictionaryLookup,
  DictionaryPronunciation,
  DictionarySense,
} from "~~/shared/types/dictionary";

const envelopeSchema = z
  .object({
    success: z.boolean(),
    data: z.unknown().nullable(),
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const wordDataSchema = z
  .object({
    headword: z.string().min(1),
    pronunciations: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
    senses: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  })
  .passthrough();

const healthSchema = z
  .object({
    status: z.string(),
    service: z.string().optional(),
  })
  .passthrough();

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class DictionaryServiceError extends Error {
  constructor(
    public readonly kind: "timeout" | "unavailable" | "invalid_response",
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "DictionaryServiceError";
  }
}

function textFrom(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstExample(record: Record<string, unknown>): string | null {
  const direct = textFrom(record, [
    "example",
    "example_en",
    "sentence",
    "sentence_en",
  ]);
  if (direct) return direct;

  const examples = record.examples;
  if (!Array.isArray(examples)) return null;

  for (const value of examples) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const found = textFrom(value as Record<string, unknown>, [
        "sentence",
        "text",
        "example",
        "sentence_en",
      ]);
      if (found) return found;
    }
  }
  return null;
}

function mapPronunciation(
  record: Record<string, unknown>,
): DictionaryPronunciation {
  return {
    ipa: textFrom(record, [
      "ipa",
      "phonetic",
      "transcription",
      "pronunciation",
    ]),
    accent: textFrom(record, ["accent", "region", "dialect"]),
    audioUrl: textFrom(record, ["audio_url", "audioUrl", "audio", "url"]),
  };
}

function mapSense(record: Record<string, unknown>): DictionarySense {
  return {
    partOfSpeech: textFrom(record, ["pos", "part_of_speech", "partOfSpeech"]),
    definitionEn: textFrom(record, [
      "definition_en",
      "definitionEn",
      "definition",
      "gloss_en",
      "gloss",
    ]),
    definitionZh: textFrom(record, [
      "definition_zh",
      "definitionZh",
      "translation",
      "translation_zh",
      "gloss_zh",
    ]),
    example: firstExample(record),
  };
}

export class DictionaryService {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(
    baseUrl: string,
    private readonly timeoutMs = 6_000,
    fetcher?: FetchLike,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetcher = fetcher ?? ((input, init) => fetch(input, init));
  }

  async lookup(rawWord: string): Promise<DictionaryLookup | null> {
    const word = rawWord.trim();
    if (!word) return null;

    const response = await this.request(
      `${this.baseUrl}/api/v1/words/${encodeURIComponent(word)}?include_pronunciations=true&include_senses=true`,
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new DictionaryServiceError(
        "unavailable",
        `词典服务返回 HTTP ${response.status}`,
      );

    const payload = await this.readJson(response);
    const envelope = envelopeSchema.safeParse(payload);
    if (!envelope.success)
      throw new DictionaryServiceError(
        "invalid_response",
        "词典服务响应格式无效",
      );
    if (!envelope.data.success || envelope.data.data === null) return null;

    const wordData = wordDataSchema.safeParse(envelope.data.data);
    if (!wordData.success)
      throw new DictionaryServiceError(
        "invalid_response",
        "词典词条缺少有效 headword",
      );

    return {
      headword: wordData.data.headword,
      pronunciations: (wordData.data.pronunciations ?? []).map(
        mapPronunciation,
      ),
      senses: (wordData.data.senses ?? []).map(mapSense),
    };
  }

  async health(): Promise<DictionaryHealth> {
    try {
      const response = await this.request(`${this.baseUrl}/api/v1/health`);
      if (!response.ok) {
        return {
          available: false,
          status: "unavailable",
          checkedAt: new Date().toISOString(),
          detail: `HTTP ${response.status}`,
        };
      }
      const payload = healthSchema.safeParse(await this.readJson(response));
      if (!payload.success) {
        return {
          available: false,
          status: "invalid_response",
          checkedAt: new Date().toISOString(),
          detail: "健康检查响应格式无效",
        };
      }
      const available = payload.data.status === "ok";
      return {
        available,
        status: available ? "ok" : "unavailable",
        checkedAt: new Date().toISOString(),
        detail: available ? null : payload.data.status,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      return {
        available: false,
        status:
          error instanceof DictionaryServiceError &&
          error.kind === "invalid_response"
            ? "invalid_response"
            : "unavailable",
        checkedAt: new Date().toISOString(),
        detail,
      };
    }
  }

  private async request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
    } catch (error) {
      if (controller.signal.aborted)
        throw new DictionaryServiceError("timeout", "词典服务请求超时", 504);
      throw new DictionaryServiceError(
        "unavailable",
        error instanceof Error ? error.message : "词典服务不可用",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new DictionaryServiceError(
        "invalid_response",
        "词典服务未返回 JSON",
      );
    }
  }
}
