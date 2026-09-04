import {
  createError,
  defineEventHandler,
  getRequestProtocol,
  getRequestURL,
  sendRedirect,
  setHeader,
  type H3Event,
} from "h3";
import {
  getAccessConfig,
  getAccessSession,
  isApiPath,
  isPublicAccessPath,
  isPublicAssetPath,
  isSameOriginRequest,
} from "../utils/access";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join("; ");

function setSecurityHeaders(event: H3Event): void {
  setHeader(event, "Content-Security-Policy", CONTENT_SECURITY_POLICY);
  setHeader(event, "Referrer-Policy", "no-referrer");
  setHeader(event, "X-Content-Type-Options", "nosniff");
  setHeader(event, "X-Frame-Options", "DENY");
  setHeader(event, "X-Robots-Tag", "noindex, nofollow, noarchive");
  setHeader(
    event,
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=()",
  );
  setHeader(event, "Cross-Origin-Opener-Policy", "same-origin");
  setHeader(event, "Cross-Origin-Resource-Policy", "same-origin");
  if (getRequestProtocol(event) === "https")
    setHeader(
      event,
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );

  const pathname = getRequestURL(event).pathname;
  if (isApiPath(pathname)) {
    setHeader(event, "Cache-Control", "no-store, max-age=0");
    setHeader(event, "Pragma", "no-cache");
    setHeader(event, "Vary", "Cookie, Origin");
  }
}

export default defineEventHandler(async (event) => {
  setSecurityHeaders(event);

  if (!isSameOriginRequest(event))
    throw createError({
      statusCode: 403,
      statusMessage: "ORIGIN_NOT_ALLOWED",
      message: "仅允许同源请求。",
    });

  const requestUrl = getRequestURL(event);
  const pathname = requestUrl.pathname;
  if (isPublicAccessPath(pathname) || isPublicAssetPath(pathname)) return;

  const apiRequest = isApiPath(pathname);
  const config = await getAccessConfig(event);
  if (!config.configured) {
    if (apiRequest)
      throw createError({
        statusCode: 503,
        statusMessage: "ACCESS_NOT_CONFIGURED",
        message: "访问保护尚未配置，请先在 D1 中初始化 8 位访问密码。",
      });
    return sendRedirect(
      event,
      `/access?redirect=${encodeURIComponent(`${pathname}${requestUrl.search}`)}`,
      302,
    );
  }

  if (await getAccessSession(event, config)) return;

  if (apiRequest)
    throw createError({
      statusCode: 401,
      statusMessage: "ACCESS_REQUIRED",
      message: "此应用仅限授权用户访问。",
    });

  return sendRedirect(
    event,
    `/access?redirect=${encodeURIComponent(`${pathname}${requestUrl.search}`)}`,
    302,
  );
});
