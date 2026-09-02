import type { D1Database } from "@cloudflare/workers-types";
import { createError, type H3Event } from "h3";

interface CloudflareContext {
  cloudflare?: {
    env?: {
      DB?: D1Database;
    };
  };
}

export function getDb(event: H3Event): D1Database {
  const db = (event.context as CloudflareContext).cloudflare?.env?.DB;
  if (!db) {
    throw createError({
      statusCode: 503,
      statusMessage: "DATABASE_UNAVAILABLE",
      message:
        "D1 数据库尚未绑定。请使用 Wrangler 本地环境或配置 Cloudflare DB binding。",
    });
  }
  return db;
}
