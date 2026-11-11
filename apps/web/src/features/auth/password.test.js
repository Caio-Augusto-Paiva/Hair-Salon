import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/features/auth/password";

const password = "safe-test-password";

describe("password hashing", () => {
  it("creates distinct Argon2id versioned envelopes with random salts", async () => {
    const [firstHash, secondHash] = await Promise.all([hashPassword(password), hashPassword(password)]);

    expect(firstHash).toMatch(/^argon2id\$v=1\$m=65536,t=3,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(secondHash).toMatch(/^argon2id\$v=1\$m=65536,t=3,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(firstHash).not.toBe(secondHash);
  });

  it("verifies a correct password", async () => {
    const passwordHash = await hashPassword(password);

    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await hashPassword(password);

    await expect(verifyPassword("incorrect-test-password", passwordHash)).resolves.toBe(false);
  });

  it.each([
    "",
    "argon2id$v=1$m=65536,t=3,p=1$short$short",
    "argon2id$v=2$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "argon2id$v=1$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$extra",
  ])("rejects a malformed stored hash", async (malformedHash) => {
    await expect(verifyPassword(password, malformedHash)).resolves.toBe(false);
  });

  it("never stores the plaintext password in the envelope", async () => {
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toContain(password);
  });
});
