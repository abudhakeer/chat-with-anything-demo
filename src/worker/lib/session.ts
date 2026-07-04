const SESSION_COOKIE = "cwa_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function buildSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export function readSessionId(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie") ?? undefined);
  const value = cookies.get(SESSION_COOKIE);
  if (!value || !value.startsWith("sess_")) {
    return null;
  }
  return value;
}

export function buildSessionSetCookie(sessionId: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function getOrCreateSessionId(request: Request): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = readSessionId(request);
  if (existing) {
    return { sessionId: existing, isNew: false };
  }
  return { sessionId: buildSessionId(), isNew: true };
}

export function withSessionCookie(response: Response, sessionId: string, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", buildSessionSetCookie(sessionId, request));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
