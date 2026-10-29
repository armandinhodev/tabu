/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  adminLoginThrottleState,
  adminSessionStatus,
  checkLoginAttempt,
  clearedSessionCookieHeader,
  createAdminSession,
  isAdminConfigured,
  isSameOriginRequest,
  readAdminConfig,
  readSessionCookie,
  recordLoginFailure,
  requireAdmin,
  resetLoginFailures,
  resetLoginThrottle,
  sessionCookieHeader,
  verifyAdminCredentials,
  verifyAdminSession,
  type AdminConfig,
} from "./admin-auth";

const ADMIN_USERNAME = "admin-decks";
const ADMIN_PASSWORD = "clave-de-prueba-2026";
const ADMIN_SECRET = "0123456789abcdef0123456789abcdef";
const APP_ORIGIN = "http://localhost:3000";
const AUTH_PATH = "/api/admin/auth";

function stubAdminEnv(): void {
  vi.stubEnv("ADMIN_USERNAME", ADMIN_USERNAME);
  vi.stubEnv("ADMIN_PASSWORD", ADMIN_PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", ADMIN_SECRET);
}

function adminConfig(): AdminConfig {
  const config = readAdminConfig(process.env);
  if (config === null) {
    throw new Error("admin configuration is missing in this test");
  }
  return config;
}

function buildRequest(init: RequestInit & { readonly url?: string } = {}): Request {
  const { url, ...rest } = init;
  return new Request(url ?? `${APP_ORIGIN}${AUTH_PATH}`, rest);
}

function buildRequestWithCookie(token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", `${ADMIN_SESSION_COOKIE_NAME}=${token}`);
  return buildRequest({ ...init, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetLoginThrottle();
});

describe("admin configuration", () => {
  it("stays disabled when the credentials are missing", () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    expect(isAdminConfigured()).toBe(false);
    expect(readAdminConfig()).toBeNull();
  });

  it("stays disabled when the session secret is too weak", () => {
    stubAdminEnv();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a".repeat(31));

    expect(isAdminConfigured()).toBe(false);
  });

  it("stays disabled when the password is blank", () => {
    stubAdminEnv();
    vi.stubEnv("ADMIN_PASSWORD", "   ");

    expect(isAdminConfigured()).toBe(false);
  });

  it("accepts a complete configuration", () => {
    stubAdminEnv();

    expect(isAdminConfigured()).toBe(true);
    expect(readAdminConfig()).toEqual({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      secret: ADMIN_SECRET,
    });
  });

  it("reads the environment lazily so a cold load without admin variables does not crash", () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    expect(() => readAdminConfig()).not.toThrow();
    expect(readAdminConfig()).toBeNull();
  });
});

describe("admin credentials", () => {
  it("accepts the configured pair and rejects everything else", () => {
    stubAdminEnv();
    const config = adminConfig();

    expect(verifyAdminCredentials(ADMIN_USERNAME, ADMIN_PASSWORD, config)).toBe(true);
    expect(verifyAdminCredentials(ADMIN_USERNAME, "otra-clave", config)).toBe(false);
    expect(verifyAdminCredentials("otro-admin", ADMIN_PASSWORD, config)).toBe(false);
    expect(verifyAdminCredentials("", "", config)).toBe(false);
  });
});

describe("admin session token", () => {
  it("round-trips a signed session", () => {
    stubAdminEnv();
    const config = adminConfig();
    const now = Date.now();
    const session = createAdminSession(config, now);

    expect(session.expiresAt).toBe(now + ADMIN_SESSION_TTL_MS);
    expect(verifyAdminSession(session.token, config, now)).toEqual({
      issuedAt: now,
      expiresAt: session.expiresAt,
    });
  });

  it("never carries the username or the password in clear text", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);

    expect(session.token).not.toContain(ADMIN_USERNAME);
    expect(session.token).not.toContain(ADMIN_PASSWORD);
  });

  it("rejects a tampered signature", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);
    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith("A") ? "B" : "A"}`;

    expect(verifyAdminSession(tampered, config)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);
    const [payload, signature] = session.token.split(".");
    const tampered = `${payload === undefined ? "" : `${payload.slice(0, -1)}X`}.${signature ?? ""}`;

    expect(tampered).not.toBe(session.token);
    expect(verifyAdminSession(tampered, config)).toBeNull();
  });

  it("rejects an expired session", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config, Date.now() - ADMIN_SESSION_TTL_MS - 1000);

    expect(verifyAdminSession(session.token, config)).toBeNull();
  });

  it("rejects a session signed with another secret", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);
    const otherConfig = { ...config, secret: "f".repeat(32) };

    expect(verifyAdminSession(session.token, otherConfig)).toBeNull();
  });

  it("rejects a session issued before the password changed", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);
    vi.stubEnv("ADMIN_PASSWORD", "clave-cambiada-2026");

    expect(verifyAdminSession(session.token, adminConfig())).toBeNull();
  });

  it("rejects a session issued before the username changed", () => {
    stubAdminEnv();
    const config = adminConfig();
    const session = createAdminSession(config);
    vi.stubEnv("ADMIN_USERNAME", "otro-admin");

    expect(verifyAdminSession(session.token, adminConfig())).toBeNull();
  });

  it("rejects a malformed token", () => {
    stubAdminEnv();
    const config = adminConfig();

    expect(verifyAdminSession("", config)).toBeNull();
    expect(verifyAdminSession("no-separator", config)).toBeNull();
    expect(verifyAdminSession("a.b.c", config)).toBeNull();
  });
});

describe("same origin protection", () => {
  it("accepts only an origin equal to the request origin", () => {
    expect(isSameOriginRequest(buildRequest({ headers: { origin: APP_ORIGIN } }))).toBe(true);
  });

  it("fails closed when the origin header is missing", () => {
    expect(isSameOriginRequest(buildRequest())).toBe(false);
  });

  it("rejects a forged origin", () => {
    expect(isSameOriginRequest(buildRequest({ headers: { origin: "https://evil.example" } }))).toBe(
      false,
    );
    expect(isSameOriginRequest(buildRequest({ headers: { origin: "null" } }))).toBe(false);
    expect(
      isSameOriginRequest(buildRequest({ headers: { origin: `${APP_ORIGIN}.evil.example` } })),
    ).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("reports an unavailable panel when the configuration is missing", async () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    const denial = requireAdmin(buildRequest());

    expect(denial).not.toBeNull();
    expect(denial?.status).toBe(503);
    expect(denial?.headers.get("Cache-Control")).toBe("no-store");
    expect(await denial?.text()).not.toContain("ADMIN_PASSWORD");
  });

  it("denies a request without a session", async () => {
    stubAdminEnv();

    const denial = requireAdmin(buildRequest());

    expect(denial?.status).toBe(401);
    expect(await denial?.json()).toEqual({ error: "Inicia sesión para continuar." });
    expect(denial?.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  });

  it("denies an expired session", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig(), Date.now() - ADMIN_SESSION_TTL_MS - 1000);

    expect(requireAdmin(buildRequestWithCookie(session.token))?.status).toBe(401);
  });

  it("denies a tampered session", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());
    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith("A") ? "B" : "A"}`;

    expect(requireAdmin(buildRequestWithCookie(tampered))?.status).toBe(401);
  });

  it("authorizes a request with a valid session", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    expect(requireAdmin(buildRequestWithCookie(session.token))).toBeNull();
  });

  it("allows a safe read without an origin header", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    expect(requireAdmin(buildRequestWithCookie(session.token, { method: "GET" }))).toBeNull();
  });

  it("denies an unsafe mutation without a same origin header", async () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const denial = requireAdmin(buildRequestWithCookie(session.token, { method: "POST" }));

    expect(denial?.status).toBe(403);
    expect(await denial?.json()).toEqual({ error: "La solicitud no está permitida." });
  });

  it("denies an unsafe mutation with a forged origin", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const denial = requireAdmin(
      buildRequestWithCookie(session.token, {
        method: "DELETE",
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(denial?.status).toBe(403);
  });

  it("allows an unsafe mutation with the same origin", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const denial = requireAdmin(
      buildRequestWithCookie(session.token, { method: "POST", headers: { origin: APP_ORIGIN } }),
    );

    expect(denial).toBeNull();
  });
});

describe("session status", () => {
  it("reports the configuration and the authentication without secrets", () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    expect(adminSessionStatus(buildRequest())).toEqual({ authenticated: false, configured: true });
    expect(adminSessionStatus(buildRequestWithCookie(session.token))).toEqual({
      authenticated: true,
      configured: true,
    });
  });

  it("reports a disabled panel when the configuration is missing", () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    expect(adminSessionStatus(buildRequest())).toEqual({ authenticated: false, configured: false });
  });
});

describe("session cookie", () => {
  it("reads the session value from the cookie header", () => {
    const request = buildRequest({
      headers: { cookie: `otro=1; ${ADMIN_SESSION_COOKIE_NAME}=abc.def` },
    });

    expect(readSessionCookie(request)).toBe("abc.def");
  });

  it("returns nothing when the cookie is absent", () => {
    expect(readSessionCookie(buildRequest())).toBeNull();
    expect(readSessionCookie(buildRequest({ headers: { cookie: "otro=1" } }))).toBeNull();
  });

  it("sets an http only, strict, root scoped and expiring cookie", () => {
    const header = sessionCookieHeader("token-value", Date.now() + ADMIN_SESSION_TTL_MS, false);

    expect(header).toContain(`${ADMIN_SESSION_COOKIE_NAME}=token-value`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=28800");
    expect(header).toContain("Expires=");
    expect(header).not.toContain("Secure");
  });

  it("marks the cookie as secure in production", () => {
    const header = sessionCookieHeader("token-value", Date.now() + ADMIN_SESSION_TTL_MS, true);

    expect(header).toContain("Secure");
  });

  it("clears the cookie with the same attributes", () => {
    const header = clearedSessionCookieHeader();

    expect(header).toContain(`${ADMIN_SESSION_COOKIE_NAME}=;`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
  });
});

describe("login throttling", () => {
  it("allows the first attempts and blocks the account after the bounded number of failures", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkLoginAttempt("admin-decks").allowed).toBe(true);
      recordLoginFailure("admin-decks");
    }

    const blocked = checkLoginAttempt("admin-decks");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps the tracked state bounded no matter how many usernames are tried", () => {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      recordLoginFailure(`user-${attempt}`);
    }

    expect(adminLoginThrottleState().trackedKeys).toBeLessThanOrEqual(32);
  });

  it("blocks every login once the global budget is exhausted", () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      recordLoginFailure(`spray-${attempt}`);
    }

    expect(checkLoginAttempt("admin-decks").allowed).toBe(false);
  });

  it("clears the failures of a username after a successful login", () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      recordLoginFailure("admin-decks");
    }
    resetLoginFailures("admin-decks");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      recordLoginFailure("admin-decks");
    }

    expect(checkLoginAttempt("admin-decks").allowed).toBe(true);
  });
});
