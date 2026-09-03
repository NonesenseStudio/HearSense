import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const profile =
  process.argv.find((value) => value.startsWith("--profile="))?.split("=")[1] ??
  "core";
const directory = path.resolve(".artifacts", "dictionary", profile);
const manifest = JSON.parse(
  await readFile(path.join(directory, "manifest.json"), "utf8"),
);
if (!manifest.selectedRows || manifest.selectedRows < 1)
  throw new Error("ECDICT build contains no selected rows");
if (!Array.isArray(manifest.files) || !manifest.files.includes("schema.sql"))
  throw new Error("ECDICT build manifest is missing schema.sql");

let statements = 0;
let oversized = 0;
for (const file of manifest.files.filter((name) => name.endsWith(".sql"))) {
  let current = "";
  for await (const chunk of createReadStream(path.join(directory, file), {
    encoding: "utf8",
  })) {
    current += chunk;
    const parts = current.split(";\n");
    current = parts.pop() ?? "";
    for (const statement of parts) {
      if (!statement.trim()) continue;
      statements += 1;
      if (Buffer.byteLength(statement, "utf8") > 100_000) oversized += 1;
    }
  }
  if (current.trim()) statements += 1;
}
if (oversized)
  throw new Error(`${oversized} SQL statements exceed D1's 100 KB limit`);
console.log(
  JSON.stringify(
    { profile, selectedRows: manifest.selectedRows, statements, oversized },
    null,
    2,
  ),
);
