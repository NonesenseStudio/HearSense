CREATE TABLE IF NOT EXISTS dictionary_entries (
  word_key TEXT PRIMARY KEY COLLATE NOCASE,
  headword TEXT NOT NULL,
  phonetic TEXT,
  definition_en TEXT,
  definition_zh TEXT,
  exchange TEXT,
  tags TEXT,
  bnc INTEGER,
  frq INTEGER,
  source_version TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS dictionary_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
