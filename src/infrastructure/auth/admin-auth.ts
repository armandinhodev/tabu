import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie that carries the signed administrative session. */
export const ADMIN_SESSION_COOKIE_NAME = "tabu_admin_session";

/** Administrative sessions expire after eight hours. */
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Minimum length accepted for the signing secret. */
export const MIN_ADMIN_SESSION_SECRET_LENGTH = 32;

/** Longest accepted session token; a real one is far shorter. */
const MAX_SESSION_TOKEN_LENGTH = 4096;

/** Bounded number of usernames tracked by the login throttle. */
const MAX_TRACKED_LOGIN_KEYS = 32;

/** Failures allowed for one username before the key is blocked. */
const LOGIN_KEY_MAX_FAILURES = 5;

/** Window and cooldown applied to one username. */
const LOGIN_KEY_WINDOW_MS = 5 * 60 * 1000;

/** Failures allowed for the whole process before every login is blocked. */
const LOGIN_GLOBAL_MAX_FAILURES = 30;

/** Window of the global failure budget. */
const LOGIN_GLOBAL_WINDOW_MS = 5 * 60 * 1000;

/** Clock tolerance for a session issued in the future. */
const SESSION_CLOCK_SKEW_MS = 60 * 1000;

const SESSION_VERSION = 1;

/**
 * User facing messages of the administrative boundary. They reuse the wording
 * of the rest of the administrative API so the panel shows one voice.
 */
export const ADMIN_MESSAGES = {
  unavailable: "El panel de administración no está disponible.",
  unauthenticated: "Inicia sesión para continuar.",
  forbidden: "La solicitud no está permitida.",
  invalidCredentials: "Usuario o contraseña incorrectos.",
  rateLimited: "Se alcanzó el límite de solicitudes. Intenta más tarde.",
  invalidBody: "Revisa los datos ingresados.",
  oversizedBody: "La solicitud es demasiado grande.",
} as const;

export interface AdminConfig {
  readonly username: string;
  readonly password: string;
  readonly secret: string;
}

export interface AdminSession {
  readonly issuedAt: number;
  readonly expiresAt: number;
}

interface AdminSessionPayload {
  readonly v: number;
  readonly cfg: string;
  readonly iat: number;
  readonly exp: number;
}

interface LoginAttemptState {
  readonly failures: number;
  readonly windowStart: number;
}

const loginAttempts = new Map<string, LoginAttemptState>();
let globalLoginFailures = 0;
let globalLoginWindowStart = 0;

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** Compares two strings without leaking where they differ. */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Digest that binds a session to the configured credentials. Changing the
 * username or the password changes the binding and invalidates old sessions.
 */
function credentialBinding(config: AdminConfig): string {
  return hmacHex(config.secret, `credentials\0${config.username}\0${config.password}`);
}

/**
 * Reads the administrative configuration from the process environment. The
 * variables are read on every call so a cold load without them is harmless and
 * never grants access: an incomplete configuration disables the panel.
 */
export function readAdminConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AdminConfig | null {
  const username = env.ADMIN_USERNAME?.trim() ?? "";
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET?.trim() ?? "";

  if (
    username === "" ||
    password.trim() === "" ||
    secret.length < MIN_ADMIN_SESSION_SECRET_LENGTH
  ) {
    return null;
  }

  return { username, password, secret };
}

/** Tells whether the administrative panel is enabled on this server. */
export function isAdminConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readAdminConfig(env) !== null;
}

/** Tells whether the cookie must carry the secure flag. */
export function isSecureCookieMode(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Compares the presented credentials with the configured ones. */
export function verifyAdminCredentials(
  username: string,
  password: string,
  config: AdminConfig,
): boolean {
  const presented = hmacHex(config.secret, `credentials\0${username.trim()}\0${password}`);

  return constantTimeEquals(presented, credentialBinding(config));
}

/** Issues a signed session bound to the current credential configuration. */
export function createAdminSession(
  config: AdminConfig,
  now: number = Date.now(),
): { readonly token: string; readonly expiresAt: number } {
  const issuedAt = now;
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_MS;
  const payload: AdminSessionPayload = {
    v: SESSION_VERSION,
    cfg: credentialBinding(config),
    iat: issuedAt,
    exp: expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", config.secret).update(encoded, "utf8").digest("base64url");

  return { token: `${encoded}.${signature}`, expiresAt };
}

function decodeSessionPayload(encoded: string): AdminSessionPayload | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Partial<AdminSessionPayload>;

  if (candidate.v !== SESSION_VERSION || typeof candidate.cfg !== "string") {
    return null;
  }

  if (typeof candidate.iat !== "number" || !Number.isFinite(candidate.iat)) {
    return null;
  }

  if (typeof candidate.exp !== "number" || !Number.isFinite(candidate.exp)) {
    return null;
  }

  return { v: SESSION_VERSION, cfg: candidate.cfg, iat: candidate.iat, exp: candidate.exp };
}

/**
 * Verifies signature, expiry, version and credential binding. A tampered,
 * expired or stale token never authenticates.
 */
export function verifyAdminSession(
  token: string,
  config: AdminConfig,
  now: number = Date.now(),
): AdminSession | null {
  if (token.length === 0 || token.length > MAX_SESSION_TOKEN_LENGTH) {
    return null;
  }

  const separator = token.indexOf(".");

  if (separator <= 0) {
    return null;
  }

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (encoded === "" || signature === "") {
    return null;
  }

  const expected = createHmac("sha256", config.secret).update(encoded, "utf8").digest("base64url");

  if (!constantTimeEquals(signature, expected)) {
    return null;
  }

  const payload = decodeSessionPayload(encoded);

  if (payload === null) {
    return null;
  }

  if (payload.exp <= now || payload.iat > now + SESSION_CLOCK_SKEW_MS) {
    return null;
  }

  if (!constantTimeEquals(payload.cfg, credentialBinding(config))) {
    return null;
  }

  return { issuedAt: payload.iat, expiresAt: payload.exp };
}

/** Reads the session token carried by the request cookies. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");

  if (header === null) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0 || part.slice(0, separator).trim() !== ADMIN_SESSION_COOKIE_NAME) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    return value === "" ? null : value;
  }

  return null;
}

/** Reads and verifies the session of a request. */
export function readAdminSession(
  request: Request,
  config: AdminConfig | null = readAdminConfig(process.env),
): AdminSession | null {
  if (config === null) {
    return null;
  }

  const token = readSessionCookie(request);

  if (token === null) {
    return null;
  }

  return verifyAdminSession(token, config);
}

/** Tells whether a request method cannot change state. */
export function isSafeRequestMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Tells whether the request comes from the same origin as the application. A
 * missing origin fails closed: browsers always send it on unsafe requests.
 */
export function isSameOriginRequest(request: Request): boolean {
  const header = request.headers.get("origin");

  if (header === null) {
    return false;
  }

  // Next's URL uses the listening hostname (often 0.0.0.0), not the public host.
  // Forwarded authorities are deliberately not trusted without a proxy policy.
  const host = request.headers.get("host");
  let expected = normalizeOrigin(request.url);
  if (host !== null) {
    if (host.length === 0 || /[\s,/@\\?#]/u.test(host)) return false;
    try {
      const url = new URL(request.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      expected = new URL(`${url.protocol}//${host}`).origin;
    } catch {
      return false;
    }
  }
  const provided = normalizeOrigin(header);

  return expected !== null && provided !== null && expected === provided;
}

/** Builds the cookie that carries a session. */
export function sessionCookieHeader(token: string, expiresAt: number, secure: boolean): string {
  const attributes = [
    `${ADMIN_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

/** Builds the cookie that removes a session. */
export function clearedSessionCookieHeader(secure: boolean = isSecureCookieMode()): string {
  const attributes = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

/** Reports the session status of a request without exposing any secret. */
export function adminSessionStatus(request: Request): {
  readonly authenticated: boolean;
  readonly configured: boolean;
} {
  const config = readAdminConfig(process.env);

  if (config === null) {
    return { authenticated: false, configured: false };
  }

  return { authenticated: readAdminSession(request, config) !== null, configured: true };
}

function adminDenial(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Guard of every administrative endpoint. It returns null when the request is
 * authorized and a denial response otherwise: an unavailable panel, a missing
 * or invalid session, or an unsafe request coming from another origin.
 */
export function requireAdmin(request: Request): Response | null {
  const config = readAdminConfig(process.env);

  if (config === null) {
    return adminDenial(503, ADMIN_MESSAGES.unavailable);
  }

  if (readAdminSession(request, config) === null) {
    const denial = adminDenial(401, ADMIN_MESSAGES.unauthenticated);
    denial.headers.append("set-cookie", clearedSessionCookieHeader());

    return denial;
  }

  if (!isSafeRequestMethod(request.method) && !isSameOriginRequest(request)) {
    return adminDenial(403, ADMIN_MESSAGES.forbidden);
  }

  return null;
}

function currentLoginState(key: string, now: number): LoginAttemptState {
  const state = loginAttempts.get(key);

  if (state === undefined || now - state.windowStart >= LOGIN_KEY_WINDOW_MS) {
    return { failures: 0, windowStart: now };
  }

  return state;
}

function pruneLoginAttempts(now: number): void {
  for (const [key, state] of loginAttempts) {
    if (now - state.windowStart >= LOGIN_KEY_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }

  while (loginAttempts.size > MAX_TRACKED_LOGIN_KEYS) {
    const oldest = loginAttempts.keys().next();

    if (oldest.done) {
      return;
    }

    loginAttempts.delete(oldest.value);
  }
}

/**
 * Tells whether one login attempt is allowed. The state is bounded: a fixed
 * number of usernames and a global budget, without trusting any forwarded
 * address header.
 */
export function checkLoginAttempt(
  key: string,
  now: number = Date.now(),
): { readonly allowed: boolean; readonly retryAfterSeconds: number } {
  if (globalLoginFailures >= LOGIN_GLOBAL_MAX_FAILURES) {
    const globalRemaining = globalLoginWindowStart + LOGIN_GLOBAL_WINDOW_MS - now;

    if (globalRemaining > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(globalRemaining / 1000) };
    }

    globalLoginFailures = 0;
    globalLoginWindowStart = now;
  }

  const state = loginAttempts.get(key);

  if (state !== undefined && state.failures >= LOGIN_KEY_MAX_FAILURES) {
    const remaining = state.windowStart + LOGIN_KEY_WINDOW_MS - now;

    if (remaining > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Records a failed login attempt against one username. */
export function recordLoginFailure(key: string, now: number = Date.now()): void {
  const state = currentLoginState(key, now);

  loginAttempts.delete(key);
  loginAttempts.set(key, { failures: state.failures + 1, windowStart: state.windowStart });
  pruneLoginAttempts(now);

  if (now - globalLoginWindowStart >= LOGIN_GLOBAL_WINDOW_MS) {
    globalLoginWindowStart = now;
    globalLoginFailures = 0;
  }

  globalLoginFailures += 1;
}

/** Clears the login throttle. */
export function resetLoginThrottle(): void {
  loginAttempts.clear();
  globalLoginFailures = 0;
  globalLoginWindowStart = 0;
}

/** Clears the failures of one username after a successful login. */
export function resetLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

/** Diagnostics of the throttle, used to prove the state stays bounded. */
export function adminLoginThrottleState(): {
  readonly trackedKeys: number;
  readonly globalFailures: number;
} {
  return { trackedKeys: loginAttempts.size, globalFailures: globalLoginFailures };
}
