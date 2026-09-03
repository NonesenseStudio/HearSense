import { describe, expect, it, vi } from "vitest";
import {
  DictionaryService,
  DictionaryServiceError,
} from "../server/services/dictionary";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DictionaryService", () => {
  function dictionaryDb(row: Record<string, unknown> | null) {
    return {
      prepare(query: string) {
        return {
          bind(value: unknown) {
            return {
              first: async <T>() =>
                query.includes("dictionary_entries") ? (row as T | null) : null,
            };
          },
          first: async <T>() => null as T | null,
        };
      },
    } as never;
  }

  it("maps an ECDICT row and preserves the original text as the primary source", async () => {
    const result = await new DictionaryService({
      dictionaryDb: dictionaryDb({
        word_key: "astonish",
        headword: "astonish",
        phonetic: "əˈstɒnɪʃ",
        definition_en: "v affect with wonder",
        definition_zh: "vt. 使惊讶",
        exchange: "p:astonished/0:astonish",
        tags: "cet4",
        bnc: 18564,
        frq: 12542,
        source_version: "test",
      }),
      uapisBaseUrl: null,
      youdaoBaseUrl: "https://dict.youdao.com",
    }).lookup("ASTONISH", { enrich: false });
    expect(result).toMatchObject({
      headword: "astonish",
      lemma: "astonish",
      pronunciations: [{ ipa: "əˈstɒnɪʃ", accent: "general", audioUrl: null }],
      senses: [
        {
          partOfSpeech: "v",
          definitionEn: "affect with wonder",
          definitionZh: "使惊讶",
        },
      ],
      meta: { textSource: "ecdict", audioSource: "youdao", degraded: false },
    });
  });

  it("uses the modern uapis shape when ECDICT misses a word", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        found: true,
        entry: {
          word: "present",
          phonetics: {
            uk: {
              text: "prɪˈzent",
              audio: "/api/v1/dictionary/audio?word=present&accent=uk",
            },
          },
          definitions: [{ part_of_speech: "n.", meaning: "礼物" }],
          english_definitions: [
            {
              part_of_speech: "n.",
              definition: "something given as a gift",
              examples: ["A present for you."],
            },
          ],
          examples: [
            { source: "Did you get a present?", translation: "你买礼物了吗？" },
          ],
        },
      }),
    );
    const result = await new DictionaryService({
      dictionaryDb: dictionaryDb(null),
      uapisBaseUrl: "https://uapis.cn",
      youdaoBaseUrl: "https://dict.youdao.com",
      fetcher,
    }).lookup("present");
    expect(result?.senses[0]).toEqual({
      partOfSpeech: "n",
      definitionEn: "something given as a gift",
      definitionZh: "礼物",
      example: "A present for you.",
    });
    expect(result?.pronunciations[0]).toEqual({
      ipa: "prɪˈzent",
      accent: "uk",
      audioUrl: null,
    });
    expect(result?.meta?.audioSource).toBe("youdao");
  });

  it("normalizes a partial upstream response without inventing missing IPA", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        success: true,
        data: {
          headword: "astonish",
          pronunciations: [
            {
              accent: "american",
              audio_url: "https://audio.example/astonish.mp3",
            },
          ],
          senses: [
            {
              pos: "verb",
              definition_en: "to surprise someone greatly",
              definition_zh: "使非常惊讶",
              examples: [{ sentence: "The news astonished everyone." }],
            },
          ],
        },
        error: null,
      }),
    );
    const result = await new DictionaryService(
      "https://dict.example/",
      100,
      fetcher,
    ).lookup("astonish");
    expect(result?.pronunciations[0]).toEqual({
      ipa: null,
      accent: "american",
      audioUrl: null,
    });
    expect(result?.senses[0]?.example).toBe("The news astonished everyone.");
  });

  it("returns null for 404 and empty upstream data", async () => {
    const notFound = vi.fn(async () => jsonResponse({}, 404));
    await expect(
      new DictionaryService("https://dict.example", 100, notFound).lookup(
        "missing",
      ),
    ).resolves.toBeNull();

    const empty = vi.fn(async () =>
      jsonResponse({
        success: false,
        data: null,
        error: { code: "WORD_NOT_FOUND" },
      }),
    );
    await expect(
      new DictionaryService("https://dict.example", 100, empty).lookup(
        "missing",
      ),
    ).resolves.toBeNull();
  });

  it("rejects malformed successful responses", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ success: true, data: { senses: [] } }),
    );
    await expect(
      new DictionaryService("https://dict.example", 100, fetcher).lookup("bad"),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("classifies timeouts distinctly", async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    await expect(
      new DictionaryService("https://dict.example", 1, fetcher).lookup("slow"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DictionaryServiceError>>({
        kind: "timeout",
        statusCode: 504,
      }),
    );
  });
});
