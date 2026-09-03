import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const CORE_RANK_LIMIT = 50_000;
const STATEMENT_LIMIT = 90_000;
const FILE_LIMIT = 4 * 1024 * 1024;
const COLUMNS = [
  "word_key",
  "headword",
  "phonetic",
  "definition_en",
  "definition_zh",
  "exchange",
  "tags",
  "bnc",
  "frq",
  "source_version",
];

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalRank(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeWord(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function isCoreRow(row) {
  const translation = optionalText(row.translation);
  if (!translation) return false;
  const bnc = optionalRank(row.bnc);
  const frq = optionalRank(row.frq);
  return Boolean(
    (bnc && bnc <= CORE_RANK_LIMIT) ||
      (frq && frq <= CORE_RANK_LIMIT) ||
      optionalText(row.tag),
  );
}

function mapRow(row, sourceVersion) {
  const headword = optionalText(row.word);
  if (!headword) return null;
  return {
    word_key: normalizeWord(headword),
    headword,
    phonetic: optionalText(row.phonetic),
    definition_en: optionalText(row.definition),
    definition_zh: optionalText(row.translation),
    exchange: optionalText(row.exchange),
    tags: optionalText(row.tag),
    bnc: optionalRank(row.bnc),
    frq: optionalRank(row.frq),
    source_version: sourceVersion,
  };
}

function valuesSql(row) {
  return `(${COLUMNS.map((column) => sqlString(row[column])).join(",")})`;
}

function createCsvParser(onRecord) {
  let field = "";
  let record = [];
  let quoted = false;
  let pendingQuote = false;
  let ended = false;

  function emitField() {
    record.push(field);
    field = "";
  }

  function emitRecord() {
    emitField();
    const current = record;
    record = [];
    if (current.length > 1) onRecord(current);
  }

  return {
    push(chunk) {
      if (ended) throw new Error("CSV parser received data after end");
      const input = pendingQuote ? `"${chunk}` : chunk;
      pendingQuote = false;
      for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (character === '"') {
          if (quoted) {
            if (input[index + 1] === '"') {
              field += '"';
              index += 1;
            } else if (index === input.length - 1) {
              pendingQuote = true;
            } else {
              quoted = false;
            }
          } else {
            quoted = true;
          }
        } else if (character === "," && !quoted) {
          emitField();
        } else if ((character === "\n" || character === "\r") && !quoted) {
          if (character === "\r" && input[index + 1] === "\n") index += 1;
          emitRecord();
        } else {
          field += character;
        }
      }
    },
    end() {
      if (ended) return;
      ended = true;
      if (pendingQuote) {
        quoted = false;
        pendingQuote = false;
      }
      if (field.length || record.length) emitRecord();
      if (quoted) throw new Error("ECDICT CSV ended inside a quoted field");
    },
  };
}

function schemaSql() {
  return `CREATE TABLE IF NOT EXISTS dictionary_entries (
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
`;
}

function flushDataFile(outputDirectory, index, chunks) {
  if (!chunks.length) return;
  const filename = `data-${String(index).padStart(4, "0")}.sql`;
  writeFileSync(path.join(outputDirectory, filename), chunks.join(""), "utf8");
}

async function build() {
  const profile = argument("profile", "core");
  if (profile !== "core" && profile !== "full")
    throw new Error(`Unsupported profile: ${profile}`);

  const sourceDirectory =
    process.env.ECDICT_SOURCE_DIR ??
    path.resolve(process.cwd(), "..", "ECDICT");
  const inputPath = argument("input", path.join(sourceDirectory, "ecdict.csv"));
  const sourceVersion = argument("source-version", "ecdict.csv");
  const outputDirectory = path.resolve(
    argument("output", path.join(".artifacts", "dictionary", profile)),
  );

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, "schema.sql"), schemaSql(), "utf8");

  let headers = null;
  let statement = "";
  let dataFileIndex = 0;
  let dataFileBytes = 0;
  let dataFileChunks = [];
  let rows = 0;
  let selectedRows = 0;
  let skippedRows = 0;
  const sourceHash = createHash("sha256");
  const files = ["schema.sql"];
  const insertPrefix = `INSERT OR REPLACE INTO dictionary_entries (${COLUMNS.join(",")}) VALUES `;

  function flushStatement() {
    if (!statement) return;
    const value = `${statement};\n`;
    const valueBytes = Buffer.byteLength(value, "utf8");
    if (dataFileBytes + valueBytes > FILE_LIMIT && dataFileChunks.length) {
      flushDataFile(outputDirectory, dataFileIndex, dataFileChunks);
      files.push(`data-${String(dataFileIndex).padStart(4, "0")}.sql`);
      dataFileIndex += 1;
      dataFileBytes = 0;
      dataFileChunks = [];
    }
    dataFileChunks.push(value);
    dataFileBytes += valueBytes;
    statement = "";
  }

  const parser = createCsvParser((rawRecord) => {
    if (!headers) {
      headers = rawRecord.map((value) => value.replace(/^\uFEFF/, ""));
      return;
    }
    rows += 1;
    const row = Object.fromEntries(
      headers.map((header, index) => [header, rawRecord[index] ?? ""]),
    );
    if (profile === "core" && !isCoreRow(row)) {
      skippedRows += 1;
      return;
    }
    const mapped = mapRow(row, sourceVersion);
    if (!mapped) {
      skippedRows += 1;
      return;
    }
    const tuple = valuesSql(mapped);
    const next = statement
      ? `${statement},${tuple}`
      : `${insertPrefix}${tuple}`;
    const nextBytes = Buffer.byteLength(next, "utf8");
    if (statement && nextBytes > STATEMENT_LIMIT) flushStatement();
    statement =
      statement && nextBytes <= STATEMENT_LIMIT
        ? next
        : `${insertPrefix}${tuple}`;
    selectedRows += 1;
  });

  for await (const chunk of createReadStream(inputPath, { encoding: "utf8" })) {
    sourceHash.update(chunk, "utf8");
    parser.push(chunk);
  }
  parser.end();
  flushStatement();
  if (dataFileChunks.length) {
    flushDataFile(outputDirectory, dataFileIndex, dataFileChunks);
    files.push(`data-${String(dataFileIndex).padStart(4, "0")}.sql`);
  }

  const sourceSha256 = sourceHash.digest("hex");
  const metadataFilename = "metadata.sql";
  writeFileSync(
    path.join(outputDirectory, metadataFilename),
    `INSERT OR REPLACE INTO dictionary_meta (key, value) VALUES\n  ('source_version', ${sqlString(sourceVersion)}),\n  ('source_sha256', ${sqlString(sourceSha256)}),\n  ('profile', ${sqlString(profile)}),\n  ('entries', ${sqlString(String(selectedRows))});\n`,
    "utf8",
  );
  files.push(metadataFilename);

  const manifest = {
    profile,
    input: path.resolve(inputPath),
    sourceVersion,
    sourceSha256,
    rows,
    selectedRows,
    skippedRows,
    sourceBytes: statSync(inputPath).size,
    generatedAt: new Date().toISOString(),
    files,
  };
  writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

await build();
