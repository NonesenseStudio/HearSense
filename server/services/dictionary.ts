import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import type {
  DictionaryHealth,
  DictionaryLookup,
  DictionaryPronunciation,
  DictionarySense,
  DictionarySuggestion,
} from "~~/shared/types/dictionary";
import {
  DictionaryRepository,
  type DictionaryEntryRow,
  type DictionarySuggestionRow,
} from "../repositories/dictionary";

const legacyEnvelopeSchema = z
  .object({
    success: z.boolean(),
    data: z.unknown().nullable(),
    error: z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const legacyWordDataSchema = z
  .object({
    headword: z.string().min(1),
    pronunciations: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
    senses: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  })
  .passthrough();

const uapisPayloadSchema = z
  .object({
    found: z.boolean(),
    entry: z.unknown().nullable().optional(),
  })
  .passthrough();

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface DictionaryServiceOptions {
  dictionaryDb?: D1Database | null;
  uapisBaseUrl?: string | null;
  uapisApiKey?: string | null;
  youdaoBaseUrl?: string | null;
  timeoutMs?: number;
  fetcher?: FetchLike;
}

export interface DictionaryLookupOptions {
  enrich?: boolean;
}

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
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
    const example = asRecord(value);
    const found = example
      ? textFrom(example, ["sentence", "text", "example", "sentence_en"])
      : null;
    if (found) return found;
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
      "text",
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

function splitLines(value: string | null): string[] {
  return value
    ? value
        // ECDICT releases encode line breaks as the two characters "\\n".
        .split(/(?:\r?\n|\\n)/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function normalizePos(value: string | null): string | null {
  const pos = value?.toLowerCase().replaceAll(".", "").trim();
  if (!pos) return null;
  if (pos === "a" || pos === "ad" || pos === "adj") return "adj";
  if (pos === "vt" || pos === "vi" || pos === "verb") return "v";
  if (pos === "noun") return "n";
  if (pos === "adv") return "adv";
  return pos;
}

function parsePosLine(line: string): { pos: string | null; text: string } {
  const match = line.match(
    /^((?:adj|adv|aux|conj|det|int|modal|noun|prep|pron|verb|n|v|a|ad|vt|vi|vi\/vt))\.?\s+(.+)$/i,
  );
  return match
    ? { pos: normalizePos(match[1] ?? ""), text: match[2] ?? line }
    : { pos: null, text: line };
}

function parseExchangeLemma(exchange: string | null): string | null {
  if (!exchange) return null;
  for (const part of exchange.split("/")) {
    const [kind, value] = part.split(":", 2);
    if (kind === "0" && value?.trim()) return value.trim();
  }
  return null;
}

function parseEcdictRow(row: DictionaryEntryRow): DictionaryLookup {
  const english = splitLines(row.definition_en).map(parsePosLine);
  const chinese = splitLines(row.definition_zh).map(parsePosLine);
  const unusedChinese = [...chinese];
  const senses: DictionarySense[] = [];

  for (const [index, item] of english.entries()) {
    const matchIndex = unusedChinese.findIndex(
      (candidate) =>
        Boolean(item.pos && candidate.pos) && item.pos === candidate.pos,
    );
    const fallbackIndex =
      matchIndex >= 0 ? matchIndex : index < unusedChinese.length ? index : -1;
    const translation =
      fallbackIndex >= 0 ? unusedChinese.splice(fallbackIndex, 1)[0] : null;
    senses.push({
      partOfSpeech: item.pos,
      definitionEn: item.text || null,
      definitionZh: translation?.text ?? null,
      example: null,
    });
  }
  for (const item of unusedChinese) {
    senses.push({
      partOfSpeech: item.pos,
      definitionEn: null,
      definitionZh: item.text || null,
      example: null,
    });
  }

  return {
    headword: row.headword,
    lemma: parseExchangeLemma(row.exchange),
    pronunciations: row.phonetic
      ? [{ ipa: row.phonetic, accent: "general", audioUrl: null }]
      : [],
    senses,
    meta: {
      textSource: "ecdict",
      audioSource: "none",
      degraded: false,
    },
  };
}

function firstDefinitionZh(value: string | null): string | null {
  const firstLine = splitLines(value)[0];
  if (!firstLine) return null;
  return parsePosLine(firstLine).text || null;
}

function mapSuggestion(row: DictionarySuggestionRow): DictionarySuggestion {
  return {
    headword: row.headword,
    phonetic: row.phonetic,
    definitionZh: firstDefinitionZh(row.definition_zh),
  };
}

function parseUapisEntry(
  entry: Record<string, unknown>,
): DictionaryLookup | null {
  const headword = textFrom(entry, ["word", "headword"]);
  if (!headword) return null;

  const pronunciations: DictionaryPronunciation[] = [];
  const phonetics = asRecord(entry.phonetics);
  if (phonetics) {
    for (const [accent, value] of Object.entries(phonetics)) {
      const record = asRecord(value);
      if (!record) continue;
      const item = mapPronunciation(record);
      item.accent = item.accent ?? accent;
      // Text lookup and pronunciation are deliberately separated: audio is
      // served by the same-origin Youdao proxy, not by a third-party URL.
      item.audioUrl = null;
      if (item.ipa || item.audioUrl) pronunciations.push(item);
    }
  }

  const senses: DictionarySense[] = [];
  const englishDefinitions = Array.isArray(entry.english_definitions)
    ? entry.english_definitions
    : [];
  const chineseDefinitions = Array.isArray(entry.definitions)
    ? entry.definitions
    : [];
  const usedEnglish = new Set<number>();
  for (const value of chineseDefinitions) {
    const definition = asRecord(value);
    if (!definition) continue;
    const partOfSpeech = textFrom(definition, ["part_of_speech", "pos"]);
    const definitionZh = textFrom(definition, ["meaning", "translation"]);
    let englishIndex = -1;
    for (const [index, candidate] of englishDefinitions.entries()) {
      if (usedEnglish.has(index)) continue;
      const record = asRecord(candidate);
      if (
        record &&
        normalizePos(textFrom(record, ["part_of_speech", "pos"])) ===
          normalizePos(partOfSpeech)
      ) {
        englishIndex = index;
        break;
      }
    }
    const english =
      englishIndex >= 0 ? asRecord(englishDefinitions[englishIndex]) : null;
    if (englishIndex >= 0) usedEnglish.add(englishIndex);
    senses.push({
      partOfSpeech: partOfSpeech ? normalizePos(partOfSpeech) : null,
      definitionEn: english
        ? textFrom(english, ["definition", "definition_en"])
        : null,
      definitionZh,
      example: english ? firstExample(english) : null,
    });
  }
  for (const [index, value] of englishDefinitions.entries()) {
    if (usedEnglish.has(index)) continue;
    const english = asRecord(value);
    if (!english) continue;
    senses.push({
      partOfSpeech: normalizePos(textFrom(english, ["part_of_speech", "pos"])),
      definitionEn: textFrom(english, ["definition", "definition_en"]),
      definitionZh: null,
      example: firstExample(english),
    });
  }

  const examples = Array.isArray(entry.examples) ? entry.examples : [];
  const firstBilingualExample = examples
    .map(asRecord)
    .find((item) => item && textFrom(item, ["source", "sentence"]));
  if (firstBilingualExample) {
    const example = textFrom(firstBilingualExample, ["source", "sentence"]);
    const firstSense = senses.find((sense) => !sense.example);
    if (firstSense && example) firstSense.example = example;
  }

  return {
    headword,
    lemma: null,
    pronunciations,
    senses,
    meta: {
      textSource: "uapis",
      audioSource: "none",
      degraded: false,
    },
  };
}

function parseLegacyPayload(
  payload: unknown,
): DictionaryLookup | null | undefined {
  const envelope = legacyEnvelopeSchema.safeParse(payload);
  if (!envelope.success) return undefined;
  if (!envelope.data.success || envelope.data.data === null) return null;
  const wordData = legacyWordDataSchema.safeParse(envelope.data.data);
  if (!wordData.success)
    throw new DictionaryServiceError(
      "invalid_response",
      "词典响应缺少有效 headword",
    );
  return {
    headword: wordData.data.headword,
    pronunciations: (wordData.data.pronunciations ?? []).map((item) => ({
      ...mapPronunciation(item),
      audioUrl: null,
    })),
    senses: (wordData.data.senses ?? []).map((item) => mapSense(item)),
    meta: {
      textSource: "uapis",
      audioSource: "none",
      degraded: false,
    },
  };
}

function markAudioSource(
  lookup: DictionaryLookup,
  youdaoConfigured: boolean,
): DictionaryLookup {
  return {
    ...lookup,
    meta: lookup.meta
      ? {
          ...lookup.meta,
          audioSource: youdaoConfigured ? "youdao" : "none",
        }
      : undefined,
  };
}

function mergeSenses(
  local: DictionarySense[],
  remote: DictionarySense[],
): DictionarySense[] {
  const merged = local.map((sense) => ({ ...sense }));
  for (const sense of remote) {
    const target = merged.find(
      (item) =>
        normalizePos(item.partOfSpeech) === normalizePos(sense.partOfSpeech),
    );
    if (!target) {
      merged.push({ ...sense });
      continue;
    }
    target.definitionEn ||= sense.definitionEn;
    target.definitionZh ||= sense.definitionZh;
    target.example ||= sense.example;
  }
  return merged;
}

function mergeLookups(
  local: DictionaryLookup,
  remote: DictionaryLookup,
): DictionaryLookup {
  const pronunciations = [...local.pronunciations];
  for (const pronunciation of remote.pronunciations) {
    const existing = pronunciations.find(
      (item) =>
        normalizePos(item.accent) === normalizePos(pronunciation.accent),
    );
    if (!existing) pronunciations.push({ ...pronunciation });
    else {
      existing.ipa ||= pronunciation.ipa;
      existing.audioUrl ||= pronunciation.audioUrl;
    }
  }
  return {
    headword: local.headword,
    lemma: local.lemma ?? remote.lemma ?? null,
    pronunciations,
    senses: mergeSenses(local.senses, remote.senses),
    meta: {
      textSource: "merged",
      audioSource: "none",
      degraded: false,
    },
  };
}

export class DictionaryService {
  private readonly repository: DictionaryRepository;
  private readonly uapisBaseUrl: string | null;
  private readonly uapisApiKey: string | null;
  private readonly youdaoBaseUrl: string | null;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(
    options: DictionaryServiceOptions | string = {},
    legacyTimeoutMs = 6_000,
    legacyFetcher?: FetchLike,
  ) {
    const normalized: DictionaryServiceOptions =
      typeof options === "string"
        ? {
            uapisBaseUrl: options,
            timeoutMs: legacyTimeoutMs,
            fetcher: legacyFetcher,
          }
        : options;
    this.repository = new DictionaryRepository(normalized.dictionaryDb ?? null);
    this.uapisBaseUrl = normalized.uapisBaseUrl?.replace(/\/+$/, "") || null;
    this.uapisApiKey = normalized.uapisApiKey?.trim() || null;
    this.youdaoBaseUrl = normalized.youdaoBaseUrl?.replace(/\/+$/, "") || null;
    this.timeoutMs = Math.max(1, Number(normalized.timeoutMs ?? 6_000));
    this.fetcher = normalized.fetcher ?? ((input, init) => fetch(input, init));
  }

  async lookup(
    rawWord: string,
    options: DictionaryLookupOptions = {},
  ): Promise<DictionaryLookup | null> {
    const word = rawWord.trim();
    if (!word) return null;

    let local: DictionaryLookup | null = null;
    let localFailed = false;
    try {
      const row = await this.repository.findByWord(word);
      if (row)
        local = markAudioSource(
          parseEcdictRow(row),
          Boolean(this.youdaoBaseUrl),
        );
    } catch {
      localFailed = true;
    }

    const shouldEnrich =
      options.enrich ??
      Boolean(
        local &&
          (!local.senses.some((sense) => sense.definitionEn) ||
            !local.pronunciations.some((item) => item.ipa)),
      );
    if (local && !shouldEnrich) return local;

    try {
      const remote = await this.lookupUapis(word);
      if (local && remote)
        return markAudioSource(
          mergeLookups(local, remote),
          Boolean(this.youdaoBaseUrl),
        );
      if (local) {
        return {
          ...local,
          meta: { ...local.meta!, degraded: localFailed || !remote },
        };
      }
      return remote
        ? markAudioSource(remote, Boolean(this.youdaoBaseUrl))
        : null;
    } catch (error) {
      if (local) {
        return {
          ...local,
          meta: { ...local.meta!, degraded: true },
        };
      }
      throw error;
    }
  }

  async suggest(rawPrefix: string, limit = 8): Promise<DictionarySuggestion[]> {
    try {
      const rows = await this.repository.findByPrefix(rawPrefix, limit);
      return rows.map(mapSuggestion);
    } catch {
      // Suggestions are an optional convenience. A missing or unavailable
      // local dictionary must not prevent the intake form from being used.
      return [];
    }
  }

  async health(): Promise<DictionaryHealth> {
    const checkedAt = new Date().toISOString();
    const meta = await this.repository.meta();
    const ecdictAvailable =
      this.repository.available && meta.sourceVersion !== null;
    const uapisConfigured = Boolean(this.uapisBaseUrl);
    const youdaoConfigured = Boolean(this.youdaoBaseUrl);
    const available = ecdictAvailable || uapisConfigured;
    const status = ecdictAvailable
      ? "ok"
      : uapisConfigured
        ? "degraded"
        : "unavailable";
    return {
      available,
      status,
      checkedAt,
      detail: ecdictAvailable
        ? null
        : uapisConfigured
          ? "ECDICT D1 未绑定或尚未导入，将使用 uapis 回退。"
          : "未配置任何词典供应商。",
      providers: {
        ecdict: {
          available: ecdictAvailable,
          version: meta.sourceVersion,
          entries: meta.entries,
          detail: this.repository.available
            ? ecdictAvailable
              ? null
              : "dictionary_meta 尚未写入"
            : "DICTIONARY_DB 未绑定",
        },
        uapis: {
          configured: uapisConfigured,
          detail: uapisConfigured ? null : "未配置 uapis 地址",
        },
        youdao: {
          configured: youdaoConfigured,
          detail: youdaoConfigured ? null : "未配置有道发音地址",
        },
      },
    };
  }

  private async lookupUapis(word: string): Promise<DictionaryLookup | null> {
    if (!this.uapisBaseUrl)
      throw new DictionaryServiceError("unavailable", "uapis 未配置");
    const query = new URLSearchParams({ word, lang: "en" });
    const response = await this.request(
      `${this.uapisBaseUrl}/api/v1/dictionary/lookup?${query.toString()}`,
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new DictionaryServiceError(
        "unavailable",
        `uapis 返回 HTTP ${response.status}`,
      );
    const payload = await this.readJson(response);
    const legacy = parseLegacyPayload(payload);
    if (legacy !== undefined)
      return legacy
        ? markAudioSource(legacy, Boolean(this.youdaoBaseUrl))
        : null;
    const parsed = uapisPayloadSchema.safeParse(payload);
    if (!parsed.success)
      throw new DictionaryServiceError(
        "invalid_response",
        "uapis 响应格式无效",
      );
    if (
      !parsed.data.found ||
      parsed.data.entry === null ||
      parsed.data.entry === undefined
    )
      return null;
    const entry = asRecord(parsed.data.entry);
    if (!entry)
      throw new DictionaryServiceError(
        "invalid_response",
        "uapis entry 格式无效",
      );
    const result = parseUapisEntry(entry);
    return result ? markAudioSource(result, Boolean(this.youdaoBaseUrl)) : null;
  }

  private async request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers({ accept: "application/json" });
    if (this.uapisApiKey)
      headers.set("authorization", `Bearer ${this.uapisApiKey}`);
    try {
      return await this.fetcher(url, { signal: controller.signal, headers });
    } catch (error) {
      if (controller.signal.aborted)
        throw new DictionaryServiceError("timeout", "uapis 请求超时", 504);
      throw new DictionaryServiceError(
        "unavailable",
        error instanceof Error ? error.message : "uapis 不可用",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new DictionaryServiceError("invalid_response", "uapis 未返回 JSON");
    }
  }
}
