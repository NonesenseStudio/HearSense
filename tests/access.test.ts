import { describe, expect, it } from "vitest";
import {
  createAccessSession,
  verifyAccessPassword,
  verifyAccessSession,
} from "../server/utils/access";

describe("private access sessions", () => {
  const secret = "a-separate-session-secret-with-enough-entropy";

  it("accepts a signed unexpired session and rejects tampering or expiry", async () => {
    const token = await createAccessSession(secret, 3600, 1_000_000);

    expect(await verifyAccessSession(token, secret, 1_000_000)).toMatchObject({
      issuedAt: 1000,
      expiresAt: 4600,
    });
    expect(
      await verifyAccessSession(`${token}x`, secret, 1_000_000),
    ).toBeNull();
    expect(
      await verifyAccessSession(token, "wrong-secret", 1_000_000),
    ).toBeNull();
    expect(await verifyAccessSession(token, secret, 4_600_000)).toBeNull();
  });

  it("compares access passwords without exposing the configured value", async () => {
    await expect(
      verifyAccessPassword(
        "correct horse battery staple",
        "correct horse battery staple",
      ),
    ).resolves.toBe(true);
    await expect(
      verifyAccessPassword("wrong password", "correct horse battery staple"),
    ).resolves.toBe(false);
  });
});
