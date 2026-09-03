import { setHeader } from "h3";
import { z } from "zod";
import {
  establishAccessSession,
  getAccessConfig,
  verifyAccessPassword,
} from "../../utils/access";
import {
  getLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "../../utils/login-rate-limit";

const loginSchema = z.object({ password: z.string().min(1).max(256) });

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store, max-age=0");
  const limit = getLoginRateLimit(event);
  if (!limit.allowed) {
    setHeader(event, "Retry-After", limit.retryAfterSeconds);
    throw createError({
      statusCode: 429,
      statusMessage: "ACCESS_RATE_LIMITED",
      message: `尝试次数过多，请 ${limit.retryAfterSeconds} 秒后重试。`,
    });
  }

  const config = getAccessConfig(event);
  if (!config.configured)
    throw createError({
      statusCode: 503,
      statusMessage: "ACCESS_NOT_CONFIGURED",
      message: "访问保护尚未配置，请先设置 NUXT_ACCESS_PASSWORD。",
    });

  const parsed = loginSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    recordLoginFailure(event);
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_ACCESS_REQUEST",
      message: "密码格式无效。",
    });
  }

  const valid = await verifyAccessPassword(
    parsed.data.password,
    config.password,
  );
  if (!valid) {
    recordLoginFailure(event);
    throw createError({
      statusCode: 401,
      statusMessage: "INVALID_ACCESS_PASSWORD",
      message: "密码不正确。",
    });
  }

  recordLoginSuccess(event);
  const session = await establishAccessSession(event, config);
  return {
    data: {
      authenticated: true,
      sessionExpiresAt: new Date(session.expiresAt * 1000).toISOString(),
    },
  };
});
