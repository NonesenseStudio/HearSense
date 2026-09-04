import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ACCESS_PASSWORD_LENGTH = 8;
const hasRemoteFlag = process.argv.includes("--remote");
const hasLocalFlag = process.argv.includes("--local");

if (hasRemoteFlag && hasLocalFlag) {
  console.error("请只选择 --local 或 --remote 其中一个目标。");
  process.exit(1);
}

const password = process.env.ACCESS_PASSWORD;
if (!password) {
  console.error(
    "请通过 ACCESS_PASSWORD 环境变量提供密码；不要把密码写入仓库或命令参数。",
  );
  process.exit(1);
}

if ([...password].length !== ACCESS_PASSWORD_LENGTH) {
  console.error(`访问密码必须严格为 ${ACCESS_PASSWORD_LENGTH} 个字符。`);
  process.exit(1);
}

const passwordMd5 = createHash("md5").update(password, "utf8").digest("hex");
const timestamp = new Date().toISOString();
const sql = [
  "INSERT INTO access_credentials (id, password_md5, created_at, updated_at)",
  `VALUES ('default', '${passwordMd5}', '${timestamp}', '${timestamp}')`,
  "ON CONFLICT(id) DO UPDATE SET",
  "password_md5 = excluded.password_md5, updated_at = excluded.updated_at;",
].join(" ");

const require = createRequire(import.meta.url);
const wranglerCommand = join(
  dirname(require.resolve("wrangler/package.json")),
  "wrangler-dist",
  "cli.js",
);
const target = hasRemoteFlag ? "--remote" : "--local";
const child = spawn(
  process.execPath,
  [wranglerCommand, "d1", "execute", "DB", target, "--command", sql],
  { stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`无法执行 Wrangler：${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
