import type { D1Database } from "@cloudflare/workers-types";

export interface DictionaryEntryRow {
  word_key: string;
  headword: string;
  phonetic: string | null;
  definition_en: string | null;
  definition_zh: string | null;
  exchange: string | null;
  tags: string | null;
  bnc: number | null;
  frq: number | null;
  source_version: string;
}

export interface DictionaryMeta {
  sourceVersion: string | null;
  entries: number | null;
}

type DictionaryDatabase = Pick<D1Database, "prepare">;

export function normalizeDictionaryKey(word: string): string {
  return word.normalize("NFKC").trim().toLowerCase();
}

export class DictionaryRepository {
  constructor(private readonly db: DictionaryDatabase | null) {}

  async findByWord(rawWord: string): Promise<DictionaryEntryRow | null> {
    if (!this.db) return null;
    const word = normalizeDictionaryKey(rawWord);
    if (!word) return null;
    return this.db
      .prepare(
        `SELECT word_key, headword, phonetic, definition_en, definition_zh,
                exchange, tags, bnc, frq, source_version
           FROM dictionary_entries
          WHERE word_key = ?1
          LIMIT 1`,
      )
      .bind(word)
      .first<DictionaryEntryRow>();
  }

  async meta(): Promise<DictionaryMeta> {
    if (!this.db) return { sourceVersion: null, entries: null };
    try {
      const [version, entries] = await Promise.all([
        this.db
          .prepare(
            "SELECT value FROM dictionary_meta WHERE key = 'source_version'",
          )
          .first<{ value: string }>(),
        this.db
          .prepare("SELECT value FROM dictionary_meta WHERE key = 'entries'")
          .first<{ value: string }>(),
      ]);
      const count = entries?.value ? Number.parseInt(entries.value, 10) : NaN;
      return {
        sourceVersion: version?.value ?? null,
        entries: Number.isFinite(count) ? count : null,
      };
    } catch {
      return { sourceVersion: null, entries: null };
    }
  }

  get available(): boolean {
    return Boolean(this.db);
  }
}
