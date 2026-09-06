// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { decodeProtectedHeader } from "jose";
import { decode as defaultDecode, encode as defaultEncode } from "next-auth/jwt";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextRequest: class NextRequest {},
}));
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const validCredentials = {
  email: "client@example.com",
  password: "correct-password",
};

function createDependencies(overrides = {}) {
  return {
    deriveAuthBucket: vi.fn(() => "a".repeat(64)),
    consumeAuthAttempt: vi.fn(async () => ({ allowed: true, blockedUntil: null })),
    authenticateCredentials: vi.fn(async () => ({
      id: "client-id",
      role: "CLIENT",
      status: "ACTIVE",
      sessionVersion: 4,
    })),
    resolveGoogleAccount: vi.fn(async () => ({
      id: "google-client-id",
      role: "CLIENT",
      status: "ACTIVE",
      sessionVersion: 2,
    })),
    ...overrides,
  };
}

function createConfigInput(overrides = {}) {
  const credentialsFactory = vi.fn((definition) => ({ id: "credentials", ...definition }));
  const googleFactory = vi.fn((definition) => ({ id: "google", ...definition }));
  return {
    env: {
      AUTH_SECRET: "test-auth-secret",
      AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret",
      NODE_ENV: "test",
    },
    pool: { query: vi.fn() },
    providerFactories: {
      Credentials: credentialsFactory,
      Google: googleFactory,
    },
    dependencies: createDependencies(),
    now: () => new Date("2040-01-01T00:00:00.000Z"),
    credentialsFactory,
    googleFactory,
    ...overrides,
  };
}

describe("Auth.js configuration", () => {
  // Mutation caught: rewrapping Auth.js as a v4 protocol rather than exposing the native v5 return object breaks server sign-in/sign-out.
  it("exposes the exact native v5 server exports returned by NextAuth", async () => {
    const { initializeAuth } = await import("../../auth.js");
    const native = {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
    const nextAuth = vi.fn(() => native);

    const result = initializeAuth({
      env: { AUTH_SECRET: "test-auth-secret", AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret" },
      NextAuth: nextAuth,
    });

    expect(result).toBe(native);
    expect(nextAuth).toHaveBeenCalledOnce();
    expect(nextAuth.mock.calls[0][0]).toMatchObject({ secret: "test-auth-secret", session: { strategy: "jwt" } });
    expect(result.handlers.GET).toBe(native.handlers.GET);
    expect(result.handlers.POST).toBe(native.handlers.POST);
    expect(result.auth).toBe(native.auth);
    expect(result.signIn).toBe(native.signIn);
    expect(result.signOut).toBe(native.signOut);
  });

  // Mutation caught: requiring secrets or a pool during import breaks builds; inventing a fallback secret weakens the native Auth.js runtime guard.
  it("initializes natively without credentials while passing an absent AUTH_SECRET through unchanged", async () => {
    const { initializeAuth } = await import("../../auth.js");
    const native = {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
    const nextAuth = vi.fn(() => native);

    await expect(Promise.resolve(initializeAuth({ env: {}, NextAuth: nextAuth }))).resolves.toBe(native);
    expect(nextAuth).toHaveBeenCalledWith(expect.objectContaining({ secret: undefined }));
  });

  // Mutation caught: supplying a generated/default secret lets Auth.js answer authentication requests when the operator omitted AUTH_SECRET.
  it("fails closed at the real Auth.js runtime boundary when AUTH_SECRET is absent", async () => {
    const { Auth } = await import("@auth/core");
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      env: { AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret", NODE_ENV: "test" },
    }));

    const response = await Auth(
      new Request("https://example.test/api/auth/session"),
      {
        ...config,
        basePath: "/api/auth",
        trustHost: true,
        logger: { error() {}, warn() {}, debug() {} },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "There was a problem with the server configuration. Check the server logs for more information.",
    });
  });

  // Mutation caught: adding Google whenever either OAuth variable is set exposes a broken login path.
  it.each([
    [{ AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: undefined }, false],
    [{ AUTH_GOOGLE_ID: "google-client-id", AUTH_GOOGLE_SECRET: undefined }, false],
    [{ AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: "google-client-secret" }, false],
    [{ AUTH_GOOGLE_ID: "google-client-id", AUTH_GOOGLE_SECRET: "google-client-secret" }, true],
  ])("composes Credentials and constructs Google only with both OAuth secrets", async (googleEnv, shouldHaveGoogle) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const input = createConfigInput({ env: { ...createConfigInput().env, ...googleEnv } });

    const config = createAuthConfig(input);

    expect(config.providers.map((provider) => provider.id)).toEqual(
      shouldHaveGoogle ? ["credentials", "google"] : ["credentials"],
    );
    expect(input.credentialsFactory).toHaveBeenCalledOnce();
    expect(input.googleFactory).toHaveBeenCalledTimes(shouldHaveGoogle ? 1 : 0);
  });

  // Mutation caught: sending a raw address/e-mail to the rate-limit repository defeats the privacy boundary.
  it("authenticates validated credentials through an opaque rate-limit bucket and returns only identity claims", async () => {
    const { createAuthConfig } = await import("./auth-config.js");
    const dependencies = createDependencies();
    const input = createConfigInput({ dependencies });
    const config = createAuthConfig(input);
    const credentials = config.providers[0];

    const result = await credentials.authorize(validCredentials, {
      headers: { "x-forwarded-for": "203.0.113.77, 10.0.0.1" },
    });

    expect(result).toEqual({ id: "client-id", role: "CLIENT", sessionVersion: 4 });
    expect(dependencies.deriveAuthBucket).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "login",
      emailNormalized: "client@example.com",
      networkAttribute: expect.stringMatching(/^network:v1:[0-9a-f]{64}$/u),
    }));
    expect(dependencies.deriveAuthBucket.mock.calls[0][0].networkAttribute).not.toContain("203.0.113.77");
    expect(dependencies.consumeAuthAttempt).toHaveBeenCalledWith(input.pool, expect.objectContaining({
      bucketKey: "a".repeat(64),
    }));
    expect(JSON.stringify(dependencies.consumeAuthAttempt.mock.calls[0][1])).not.toMatch(/client@example\.com|203\.0\.113\.77/u);
    expect(dependencies.authenticateCredentials).toHaveBeenCalledWith(input.pool, validCredentials);
  });

  // Mutation caught: validating Auth.js's metadata-bearing Credentials body directly makes native server signIn reject valid credentials before rate limiting.
  it("accepts a real Auth.js Credentials callback body while projecting only email and password", async () => {
    const { Auth, skipCSRFCheck } = await import("@auth/core");
    const { createAuthConfig } = await import("./auth-config.js");
    const dependencies = createDependencies();
    const input = createConfigInput({ dependencies, providerFactories: undefined });
    const config = createAuthConfig(input);
    const body = new URLSearchParams({
      ...validCredentials,
      callbackUrl: "https://example.test/account",
      frameworkMetadata: "must-not-reach-the-repository",
    });

    const response = await Auth(
      new Request("https://example.test/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.77",
        },
        body,
      }),
      {
        ...config,
        basePath: "/api/auth",
        trustHost: true,
        skipCSRFCheck,
        logger: { error() {}, warn() {}, debug() {} },
      },
    );

    expect(dependencies.consumeAuthAttempt).toHaveBeenCalledOnce();
    expect(dependencies.authenticateCredentials).toHaveBeenCalledWith(input.pool, validCredentials);
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("next-auth.session-token=");
  });

  // Mutation caught: leaking validation, throttling, or account state through Credentials authorize enables enumeration.
  it.each([
    ["invalid input", { email: "bad", password: "short" }, { allowed: true }],
    ["blocked bucket", validCredentials, { allowed: false }],
    ["invalid credentials", validCredentials, { allowed: true }, null],
  ])("returns the same generic failure for %s", async (_label, credentials, rateLimit, account = undefined) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const dependencies = createDependencies({
      consumeAuthAttempt: vi.fn(async () => rateLimit),
      ...(account === null ? { authenticateCredentials: vi.fn(async () => null) } : {}),
    });
    const config = createAuthConfig(createConfigInput({ dependencies }));

    await expect(config.providers[0].authorize(credentials, { headers: {} })).resolves.toBeNull();
  });

  // Mutation caught: treating an omitted or unknown account status as active grants a stale identity a new session.
  it.each([undefined, "PENDING", "SUSPENDED", "DELETED"])("rejects a Credentials account with status %s", async (status) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      dependencies: createDependencies({
        authenticateCredentials: vi.fn(async () => ({
          id: "client-id", role: "CLIENT", status, sessionVersion: 4,
        })),
      }),
    }));

    await expect(config.providers[0].authorize(validCredentials, { headers: {} })).resolves.toBeNull();
  });

  // Mutation caught: accepting a missing or malformed Credentials account id lets Auth.js replace nullish ids with random UUIDs and issue an unrelated identity.
  it.each([null, "", 123])("rejects a Credentials account with id %s", async (id) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      dependencies: createDependencies({
        authenticateCredentials: vi.fn(async () => ({
          id, role: "CLIENT", status: "ACTIVE", sessionVersion: 4,
        })),
      }),
    }));

    await expect(config.providers[0].authorize(validCredentials, { headers: {} })).resolves.toBeNull();
  });

  // Mutation caught: persisting OAuth tokens or a non-canonical provider identity creates unnecessary credential exposure.
  it("resolves verified Google identities explicitly without passing provider tokens to the repository", async () => {
    const { createAuthConfig } = await import("./auth-config.js");
    const dependencies = createDependencies();
    const config = createAuthConfig(createConfigInput({
      env: {
        AUTH_SECRET: "test-auth-secret",
        AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret",
        AUTH_GOOGLE_ID: "google-client-id",
        AUTH_GOOGLE_SECRET: "google-client-secret",
        NODE_ENV: "test",
      },
      dependencies,
    }));
    const user = { id: "provider-user", name: "Google Client", email: "google@example.com" };

    await expect(config.callbacks.signIn({
      user,
      account: {
        provider: "google",
        providerAccountId: "google-subject",
        access_token: "must-not-persist",
        refresh_token: "must-not-persist",
        id_token: "must-not-persist",
      },
      profile: { email: "google@example.com", email_verified: true, name: "Google Client" },
    })).resolves.toBe(true);

    expect(user).toEqual({ id: "google-client-id", role: "CLIENT", sessionVersion: 2 });
    expect(dependencies.resolveGoogleAccount).toHaveBeenCalledWith(expect.anything(), {
      provider: "google",
      providerAccountId: "google-subject",
      email: "google@example.com",
      emailVerified: true,
      name: "Google Client",
    });
  });

  // Mutation caught: accepting Google repository results whose status is omitted or non-active bypasses account suspension/deletion.
  it.each([undefined, "PENDING", "SUSPENDED", "DELETED"])("rejects a Google identity with status %s", async (status) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      env: {
        AUTH_SECRET: "test-auth-secret",
        AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret",
        AUTH_GOOGLE_ID: "google-client-id",
        AUTH_GOOGLE_SECRET: "google-client-secret",
      },
      dependencies: createDependencies({
        resolveGoogleAccount: vi.fn(async () => ({
          id: "google-client-id", role: "CLIENT", status, sessionVersion: 2,
        })),
      }),
    }));

    await expect(config.callbacks.signIn({
      user: { id: "provider-user", name: "Google Client", email: "google@example.com" },
      account: { provider: "google", providerAccountId: "google-subject" },
      profile: { email: "google@example.com", email_verified: true, name: "Google Client" },
    })).resolves.toBe(false);
  });

  // Mutation caught: accepting a missing or malformed Google account id mutates the Auth.js user into an identity that cannot be reloaded safely.
  it.each([null, "", 123])("rejects a Google identity with id %s", async (id) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      env: {
        AUTH_SECRET: "test-auth-secret",
        AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret",
        AUTH_GOOGLE_ID: "google-client-id",
        AUTH_GOOGLE_SECRET: "google-client-secret",
      },
      dependencies: createDependencies({
        resolveGoogleAccount: vi.fn(async () => ({
          id, role: "CLIENT", status: "ACTIVE", sessionVersion: 2,
        })),
      }),
    }));

    await expect(config.callbacks.signIn({
      user: { id: "provider-user", name: "Google Client", email: "google@example.com" },
      account: { provider: "google", providerAccountId: "google-subject" },
      profile: { email: "google@example.com", email_verified: true, name: "Google Client" },
    })).resolves.toBe(false);
  });

  // Mutation caught: retaining default Auth.js profile fields or provider data in JWT/session expands the authorization attack surface.
  it("minimizes JWT and public session claims while preserving expiry", async () => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput());

    const token = await config.callbacks.jwt({
      token: {
        sub: "old-id", email: "old@example.com", name: "Old", picture: "https://example.test/image",
        access_token: "access", refresh_token: "refresh", id_token: "id", iat: 1, exp: 2,
      },
      user: { id: "client-id", role: "EMPLOYEE", sessionVersion: 9, email: "client@example.com" },
    });
    const session = await config.callbacks.session({
      session: { user: { name: "Client", email: "client@example.com", image: "https://example.test/image" }, expires: "2040-01-01T01:00:00.000Z" },
      token,
    });

    expect(token).toEqual({ sub: "client-id", role: "EMPLOYEE", sessionVersion: 9, iat: 1, exp: 2 });
    expect(session).toEqual({
      user: { id: "client-id", role: "EMPLOYEE", sessionVersion: 9 },
      expires: "2040-01-01T01:00:00.000Z",
    });
  });

  // Mutation caught: using Auth.js's default encoder adds `jti` and can retain profile/provider fields beyond the approved JWT claim set.
  it("issues and decrypts an Auth.js JWE with only the approved own claims", async () => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput());
    const secret = "jwt-issuance-test-secret-with-at-least-thirty-two-bytes";
    const salt = "next-auth.session-token";

    const encode = config.jwt?.encode ?? defaultEncode;
    const encoded = await encode({
      token: {
        sub: "client-id",
        role: "EMPLOYEE",
        sessionVersion: 9,
        email: "client@example.com",
        name: "Client",
        picture: "https://example.test/avatar",
        access_token: "provider-access-token",
        refresh_token: "provider-refresh-token",
        id_token: "provider-id-token",
      },
      secret,
      salt,
      maxAge: 3600,
    });
    const decoded = await defaultDecode({ token: encoded, secret, salt });

    expect(encoded.split(".")).toHaveLength(5);
    expect(decodeProtectedHeader(encoded)).toEqual({
      alg: "dir",
      enc: "A256CBC-HS512",
      kid: expect.any(String),
    });
    expect(decoded).toMatchObject({ sub: "client-id", role: "EMPLOYEE", sessionVersion: 9 });
    expect(typeof decoded.iat).toBe("number");
    expect(typeof decoded.exp).toBe("number");
    expect(Object.keys(decoded).toSorted()).toEqual(["exp", "iat", "role", "sessionVersion", "sub"]);
  });

  // Mutation caught: ignoring a protected-header `kid` breaks secret rotation, while accepting malformed secrets/tokens can weaken JWE handling.
  it("decrypts a rotated-secret JWE by kid and fails securely for invalid codec input", async () => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput());
    const salt = "next-auth.session-token";
    const oldSecret = "old-jwt-rotation-secret-with-at-least-thirty-two-bytes";
    const newSecret = "new-jwt-rotation-secret-with-at-least-thirty-two-bytes";
    const token = { sub: "client-id", role: "CLIENT", sessionVersion: 4 };

    const encoded = await config.jwt.encode({ token, secret: oldSecret, salt, maxAge: 3600 });
    const encodedWithCurrentSecret = await config.jwt.encode({
      token,
      secret: [newSecret, oldSecret],
      salt,
      maxAge: 3600,
    });

    await expect(config.jwt.decode({ token: encoded, secret: [newSecret, oldSecret], salt }))
      .resolves.toMatchObject(token);
    await expect(config.jwt.decode({ token: encodedWithCurrentSecret, secret: newSecret, salt }))
      .resolves.toMatchObject(token);
    await expect(config.jwt.encode({ token, secret: "", salt, maxAge: 3600 })).rejects.toThrow(TypeError);
    await expect(config.jwt.encode({ token, secret: [], salt, maxAge: 3600 })).rejects.toThrow(TypeError);
    await expect(config.jwt.decode({ token: "not-a-jwe", secret: oldSecret, salt })).resolves.toBeNull();
  });

  // Mutation caught: marking development cookies secure prevents local authentication; omitting it elsewhere leaks sessions over HTTP.
  it.each([
    ["development", false],
    ["production", true],
  ])("uses the required session-cookie policy in %s", async (nodeEnv, secure) => {
    const { createAuthConfig } = await import("./auth-config.js");
    const config = createAuthConfig(createConfigInput({
      env: { AUTH_SECRET: "test-auth-secret", AUTH_RATE_LIMIT_SECRET: "test-rate-limit-secret", NODE_ENV: nodeEnv },
    }));

    expect(config.cookies.sessionToken.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
    });
  });
});
