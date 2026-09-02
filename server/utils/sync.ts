import type { H3Event } from "h3";

export function isOfflineReplay(event: H3Event): boolean {
  return getHeader(event, "x-hearsense-offline-event") === "1";
}

export async function hashPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
