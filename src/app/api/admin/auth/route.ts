import { z } from "zod";

import { adminBody, AdminHttpError } from "@/infrastructure/admin-http/http";
import {
  ADMIN_MESSAGES,
  adminSessionStatus,
  checkLoginAttempt,
  clearedSessionCookieHeader,
  createAdminSession,
  isSameOriginRequest,
  isSecureCookieMode,
  readAdminConfig,
  recordLoginFailure,
  resetLoginFailures,
  requireAdmin,
  sessionCookieHeader,
  verifyAdminCredentials,
} from "@/infrastructure/auth/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentials = z
  .object({
    username: z.string().min(1).max(128),
    password: z.string().min(1).max(256),
  })
  .strict();

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

async function readCredentials(
  request: Request,
): Promise<{ readonly username: string; readonly password: string } | Response> {
  try {
    return await adminBody(request, credentials);
  } catch (error) {
    if (error instanceof AdminHttpError) {
      const message =
        error.status === 413 ? ADMIN_MESSAGES.oversizedBody : ADMIN_MESSAGES.invalidBody;

      return json({ error: message }, error.status);
    }

    throw error;
  }
}

/** Session status of the administrator: no credential and no token is exposed. */
export async function GET(request: Request): Promise<Response> {
  return json(adminSessionStatus(request), 200);
}

/** Starts an administrative session with the environment credentials. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return json({ error: ADMIN_MESSAGES.forbidden }, 403);
  }

  const config = readAdminConfig(process.env);

  if (config === null) {
    return json({ error: ADMIN_MESSAGES.unavailable }, 503);
  }

  const parsed = await readCredentials(request);

  if (parsed instanceof Response) {
    return parsed;
  }

  const key = parsed.username.trim().toLowerCase();
  const attempt = checkLoginAttempt(key);

  if (!attempt.allowed) {
    return json({ error: ADMIN_MESSAGES.rateLimited }, 429, {
      "Retry-After": String(attempt.retryAfterSeconds),
    });
  }

  if (!verifyAdminCredentials(parsed.username, parsed.password, config)) {
    recordLoginFailure(key);

    return json({ error: ADMIN_MESSAGES.invalidCredentials }, 401);
  }

  resetLoginFailures(key);

  const session = createAdminSession(config);
  const response = json({ authenticated: true }, 200);
  response.headers.append(
    "set-cookie",
    sessionCookieHeader(session.token, session.expiresAt, isSecureCookieMode()),
  );

  return response;
}

/** Ends the administrative session. */
export async function DELETE(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return json({ error: ADMIN_MESSAGES.forbidden }, 403);
  }

  const denial = requireAdmin(request);

  if (denial !== null) {
    return denial;
  }

  const response = json({ authenticated: false }, 200);
  response.headers.append("set-cookie", clearedSessionCookieHeader());

  return response;
}
