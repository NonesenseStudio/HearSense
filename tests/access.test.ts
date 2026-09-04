import { describe, expect, it } from "vitest";
import {
  ACCESS_PASSWORD_LENGTH,
  createAccessSession,
  isAccessPasswordValid,
  verifyAccessPassword,
  verifyAccessSession,
} from "../server/utils/access";
import { md5Hex } from "../server/utils/md5";

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

  it("requires an eight-character password and compares its MD5 hash", async () => {
    const passwordMd5 = "25d55ad283aa400af464c76d713c07ad";

    expect(ACCESS_PASSWORD_LENGTH).toBe(8);
    expect(md5Hex("12345678")).toBe(passwordMd5);
    expect(isAccessPasswordValid("12345678")).toBe(true);
    expect(isAccessPasswordValid("1234567")).toBe(false);
    expect(isAccessPasswordValid("123456789")).toBe(false);
    await expect(verifyAccessPassword("12345678", passwordMd5)).resolves.toBe(
      true,
    );
    await expect(verifyAccessPassword("12345679", passwordMd5)).resolves.toBe(
      false,
    );
  });
});
