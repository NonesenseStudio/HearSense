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
      audioUrl: "https://audio.example/astonish.mp3",
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
