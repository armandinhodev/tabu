/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSession,
  readAdminConfig,
  resetLoginThrottle,
  type AdminConfig,
} from "@/infrastructure/auth/admin-auth";

import { DELETE, GET, POST } from "./route";

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

function buildRequest(init: RequestInit & { readonly method?: string } = {}): Request {
  return new Request(`${APP_ORIGIN}${AUTH_PATH}`, init);
}

function loginRequest(body: unknown, init: RequestInit = {}): Request {
  return buildRequest({
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      origin: APP_ORIGIN,
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookieHeaderOf(response: Response): string {
  const cookies = response.headers.getSetCookie();
  expect(cookies.length).toBeGreaterThan(0);
  return cookies[0] ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetLoginThrottle();
});

describe("GET /api/admin/auth", () => {
  it("reports the session status without secrets", async () => {
    stubAdminEnv();

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false, configured: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports an authenticated session", async () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const response = await GET(
      buildRequest({ headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${session.token}` } }),
    );

    expect(await response.json()).toEqual({ authenticated: true, configured: true });
  });

  it("reports a disabled panel when the configuration is missing", async () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false, configured: false });
  });
});

describe("POST /api/admin/auth", () => {
  it("rejects a login without an origin header", async () => {
    stubAdminEnv();

    const response = await POST(
      buildRequest({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects a login with a forged origin", async () => {
    stubAdminEnv();

    const response = await POST(
      loginRequest(
        { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
        { headers: { origin: "https://evil.example" } },
      ),
    );

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("reports an unavailable panel when the configuration is missing", async () => {
    vi.stubEnv("ADMIN_USERNAME", undefined);
    vi.stubEnv("ADMIN_PASSWORD", undefined);
    vi.stubEnv("ADMIN_SESSION_SECRET", undefined);

    const response = await POST(loginRequest({ username: "a", password: "b" }));

    expect(response.status).toBe(503);
  });

  it("rejects wrong credentials without a session cookie", async () => {
    stubAdminEnv();

    const response = await POST(loginRequest({ username: ADMIN_USERNAME, password: "incorrecta" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Usuario o contraseña incorrectos." });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rejects a body that is not json", async () => {
    stubAdminEnv();

    const response = await POST(
      buildRequest({
        method: "POST",
        headers: { "Content-Type": "text/plain", origin: APP_ORIGIN },
        body: "usuario=admin",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a malformed json body", async () => {
    stubAdminEnv();

    const response = await POST(
      buildRequest({
        method: "POST",
        headers: { "Content-Type": "application/json", origin: APP_ORIGIN },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects unknown fields and missing credentials", async () => {
    stubAdminEnv();

    expect((await POST(loginRequest({ username: "a", password: "b", role: "root" }))).status).toBe(
      400,
    );
    expect((await POST(loginRequest({ username: "a" }))).status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    stubAdminEnv();

    const response = await POST(loginRequest({ username: "a", password: "b".repeat(9000) }));

    expect(response.status).toBe(413);
  });

  it("starts a session with a signed expiring http only cookie", async () => {
    stubAdminEnv();

    const response = await POST(
      loginRequest({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });

    const cookie = sessionCookieHeaderOf(response);
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain(ADMIN_USERNAME);
    expect(cookie).not.toContain(ADMIN_PASSWORD);
  });

  it("issues a session that authorizes the status endpoint", async () => {
    stubAdminEnv();

    const response = await POST(
      loginRequest({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    );
    const cookie = sessionCookieHeaderOf(response).split(";")[0] ?? "";

    const status = await GET(buildRequest({ headers: { cookie } }));

    expect(await status.json()).toEqual({ authenticated: true, configured: true });
  });

  it("blocks the login after the bounded number of failed attempts", async () => {
    stubAdminEnv();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(
        loginRequest({ username: ADMIN_USERNAME, password: "incorrecta" }),
      );
      expect(response.status).toBe(401);
    }

    const blocked = await POST(loginRequest({ username: ADMIN_USERNAME, password: "incorrecta" }));

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("clears the failures of the username after a successful login", async () => {
    stubAdminEnv();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await POST(loginRequest({ username: ADMIN_USERNAME, password: "incorrecta" }));
      expect(failed.status).toBe(401);
    }

    const accepted = await POST(
      loginRequest({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    );
    expect(accepted.status).toBe(200);

    const next = await POST(loginRequest({ username: ADMIN_USERNAME, password: "incorrecta" }));

    expect(next.status).toBe(401);
  });
});

describe("DELETE /api/admin/auth", () => {
  it("rejects a logout without an origin header", async () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const response = await DELETE(
      buildRequest({
        method: "DELETE",
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${session.token}` },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects a logout without a session", async () => {
    stubAdminEnv();

    const response = await DELETE(
      buildRequest({ method: "DELETE", headers: { origin: APP_ORIGIN } }),
    );

    expect(response.status).toBe(401);
  });

  it("clears the session cookie", async () => {
    stubAdminEnv();
    const session = createAdminSession(adminConfig());

    const response = await DELETE(
      buildRequest({
        method: "DELETE",
        headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${session.token}`, origin: APP_ORIGIN },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });

    const cookie = sessionCookieHeaderOf(response);
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});
