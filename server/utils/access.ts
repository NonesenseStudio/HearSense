import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestProtocol,
  getRequestURL,
  setCookie,
  type H3Event,
} from "h3";
import { getDb } from "./db";
import { md5Hex } from "./md5";

export const ACCESS_COOKIE_NAME = "hearsense_access";
export const ACCESS_PASSWORD_LENGTH = 8;
export const DEFAULT_ACCESS_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_ACCESS_SESSION_TTL_SECONDS = 60 * 60;
export const MAX_ACCESS_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

const TEXT_ENCODER = new TextEncoder();

export interface AccessConfig {
  passwordMd5: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  configured: boolean;
}

export interface AccessSession {
  issuedAt: number;
  expiresAt: number;
}

interface AccessSessionPayload extends AccessSession {
  nonce: string;
}

interface AccessCredentialRow {
  password_md5: string;
}

function isMd5Hex(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

export function isAccessPasswordValid(value: string): boolean {
  return Array.from(value).length === ACCESS_PASSWORD_LENGTH;
}

async function getStoredAccessPasswordMd5(event: H3Event): Promise<string> {
  try {
    const row = await getDb(event)
      .prepare(
        "SELECT password_md5 FROM access_credentials WHERE id = 'default'",
      )
      .first<AccessCredentialRow>();
    return typeof row?.password_md5 === "string" ? row.password_md5 : "";
  } catch {
    return "";
  }
}

export async function getAccessConfig(event: H3Event): Promise<AccessConfig> {
  const runtimeConfig = useRuntimeConfig(event);
  const configuredCookieSecret =
    typeof runtimeConfig.accessCookieSecret === "string"
      ? runtimeConfig.accessCookieSecret
      : "";
  const passwordMd5 = await getStoredAccessPasswordMd5(event);
  const sessionTtlValue = Number(runtimeConfig.accessSessionTtlSeconds);
  const sessionTtlSeconds = Number.isFinite(sessionTtlValue)
    ? Math.min(
        MAX_ACCESS_SESSION_TTL_SECONDS,
        Math.max(MIN_ACCESS_SESSION_TTL_SECONDS, Math.round(sessionTtlValue)),
      )
    : DEFAULT_ACCESS_SESSION_TTL_SECONDS;

  return {
    passwordMd5,
    sessionSecret: configuredCookieSecret || passwordMd5,
    sessionTtlSeconds,
    configured:
      isMd5Hex(passwordMd5) &&
      (!configuredCookieSecret || configuredCookieSecret.length >= 32),
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

async function signText(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, TEXT_ENCODER.encode(value)),
  );
}

export async function verifyAccessPassword(
  candidate: string,
  expectedPasswordMd5: string,
): Promise<boolean> {
  if (!isAccessPasswordValid(candidate) || !isMd5Hex(expectedPasswordMd5))
    return false;
  const candidateDigest = md5Hex(candidate);
  return constantTimeEqual(
    TEXT_ENCODER.encode(candidateDigest),
    TEXT_ENCODER.encode(expectedPasswordMd5),
  );
}

export async function createAccessSession(
  sessionSecret: string,
  sessionTtlSeconds: number,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const payload: AccessSessionPayload = {
    issuedAt,
    expiresAt: issuedAt + sessionTtlSeconds,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const encodedPayload = bytesToBase64Url(
    TEXT_ENCODER.encode(JSON.stringify(payload)),
  );
  const signature = await signText(sessionSecret, encodedPayload);
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifyAccessSession(
  token: string | undefined,
  sessionSecret: string,
  now = Date.now(),
): Promise<AccessSession | null> {
  if (!token || !sessionSecret || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const encodedPayload = parts[0];
  const providedSignature = base64UrlToBytes(parts[1]);
  const payloadBytes = base64UrlToBytes(encodedPayload);
  if (!providedSignature || !payloadBytes) return null;

  const expectedSignature = await signText(sessionSecret, encodedPayload);
  if (!constantTimeEqual(providedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as Partial<AccessSessionPayload>;
    const currentTime = Math.floor(now / 1000);
    const issuedAt = payload.issuedAt;
    const expiresAt = payload.expiresAt;
    if (
      typeof issuedAt !== "number" ||
      !Number.isInteger(issuedAt) ||
      typeof expiresAt !== "number" ||
      !Number.isInteger(expiresAt) ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16 ||
      expiresAt <= currentTime ||
      issuedAt > currentTime + 60
    )
      return null;
    return {
      issuedAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

export async function getAccessSession(
  event: H3Event,
  config?: AccessConfig,
): Promise<AccessSession | null> {
  const resolvedConfig = config ?? (await getAccessConfig(event));
  if (!resolvedConfig.configured) return null;
  return verifyAccessSession(
    getCookie(event, ACCESS_COOKIE_NAME),
    resolvedConfig.sessionSecret,
  );
}

function isSecureRequest(event: H3Event): boolean {
  return getRequestProtocol(event) === "https";
}

export async function establishAccessSession(
  event: H3Event,
  config: AccessConfig,
): Promise<AccessSession> {
  const now = Date.now();
  const token = await createAccessSession(
    config.sessionSecret,
    config.sessionTtlSeconds,
    now,
  );
  const expiresAt = Math.floor(now / 1000) + config.sessionTtlSeconds;
  setCookie(event, ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureRequest(event),
    sameSite: "strict",
    path: "/",
    maxAge: config.sessionTtlSeconds,
  });
  return {
    issuedAt: Math.floor(now / 1000),
    expiresAt,
  };
}

export function clearAccessSession(event: H3Event): void {
  deleteCookie(event, ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureRequest(event),
    sameSite: "strict",
    path: "/",
  });
}

export function isSameOriginRequest(event: H3Event): boolean {
  const origin = getRequestHeader(event, "origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const requestUrl = getRequestURL(event, {
      xForwardedHost: true,
      xForwardedProto: true,
    });
    return originUrl.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export function getClientIdentifier(event: H3Event): string {
  const cloudflareIp = getRequestHeader(event, "cf-connecting-ip")?.trim();
  if (cloudflareIp) return `cf:${cloudflareIp}`;
  const forwardedIp = getRequestHeader(event, "x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return forwardedIp ? `forwarded:${forwardedIp}` : "unknown";
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isPublicAccessPath(pathname: string): boolean {
  return (
    pathname === "/access" ||
    pathname === "/access/" ||
    pathname === "/api/access/status" ||
    pathname === "/api/access/login" ||
    pathname === "/api/access/logout"
  );
}

export function isPublicAssetPath(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/_nuxt/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/workbox-")
  );
}
