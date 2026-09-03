import { readFile } from "node:fs/promises";

const config = await readFile("wrangler.jsonc", "utf8");
const placeholder = "00000000-0000-0000-0000-000000000003";
if (config.includes(placeholder)) {
  throw new Error(
    "DICTIONARY_DB 仍使用占位 database_id；请先创建 hearsense-dictionary 并更新 wrangler.jsonc。",
  );
}
console.log("DICTIONARY_DB production binding looks configured.");
