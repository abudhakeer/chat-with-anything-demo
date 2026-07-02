import { RATE_LIMIT_UPLOADS_PER_HOUR } from "./constants";

function hourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13);
}

function rateLimitKey(ip: string, now = Date.now()): string {
  return `upload:${ip}:${hourBucket(now)}`;
}

export async function checkUploadRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = rateLimitKey(ip);
  const currentRaw = await kv.get(key);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;

  if (current >= RATE_LIMIT_UPLOADS_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }

  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: 60 * 60 * 2 });

  return {
    allowed: true,
    remaining: Math.max(RATE_LIMIT_UPLOADS_PER_HOUR - next, 0),
  };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
