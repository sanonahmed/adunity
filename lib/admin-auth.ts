import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "adunity_admin";
const SESSION_SECONDS = 60 * 60 * 8;

type AdminConfig = { password: string; secret: string };

export function getAdminConfig(): AdminConfig | null {
  const password = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (password.length < 12 || secret.length < 32) return null;
  return { password, secret };
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function verifyAdminPassword(submitted: string, configured: string): boolean {
  return safeEqual(
    createHash("sha256").update(submitted, "utf8").digest(),
    createHash("sha256").update(configured, "utf8").digest(),
  );
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminToken(secret: string): { token: string; maxAge: number } {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(24).toString("base64url")}`;
  return { token: `${payload}.${sign(payload, secret)}`, maxAge: SESSION_SECONDS };
}

export function verifyAdminToken(token: string | undefined, secret: string): boolean {
  if (!token || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresRaw, nonce, signature] = parts;
  const expires = Number(expiresRaw);
  if (!/^\d+$/.test(expiresRaw) || !Number.isSafeInteger(expires) || expires <= Date.now() / 1000) return false;
  if (!/^[A-Za-z0-9_-]{32}$/.test(nonce)) return false;
  const payload = `${expiresRaw}.${nonce}`;
  return safeEqual(Buffer.from(signature), Buffer.from(sign(payload, secret)));
}

export async function hasAdminSession(): Promise<boolean> {
  const config = getAdminConfig();
  if (!config) return false;
  const jar = await cookies();
  return verifyAdminToken(jar.get(COOKIE_NAME)?.value, config.secret);
}

export async function setAdminSession(): Promise<void> {
  const config = getAdminConfig();
  if (!config) throw new Error("admin_not_configured");
  const jar = await cookies();
  const { token, maxAge } = createAdminToken(config.secret);
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/** Require a browser same-origin request before accepting a state change. */
export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

  /*
   * `request.url` cannot decide this on its own: serverless hosts and proxies
   * rebuild it from their internal bind address, so a panel opened at
   * 127.0.0.1:3000 or https://adunity.onrender.com arrives as
   * http://localhost:3000 and every admin write would look cross-site.
   *
   * Compare the browser's Origin with the request host headers instead.
   * `Host` is set by the browser, while a proxy supplies the public name in
   * `X-Forwarded-Host`. Some runtimes supply their internal bind name in that
   * forwarded header alongside the public Host, so accept a match against
   * either. A cross-site browser cannot set `X-Forwarded-Host`, and the admin
   * cookie is SameSite=Strict. `X-Forwarded-Proto` carries the public scheme.
   */
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  if (forwardedProto && `${forwardedProto}:` !== originUrl.protocol) return false;

  const originHost = originUrl.host.toLowerCase();
  const requestHosts = [
    firstHeaderValue(request.headers.get("x-forwarded-host")),
    firstHeaderValue(request.headers.get("host")),
  ].filter((host): host is string => host !== null);
  if (requestHosts.length > 0) return requestHosts.includes(originHost);

  try {
    return new URL(request.url).host.toLowerCase() === originHost;
  } catch {
    return false;
  }
}

/** First entry of a possibly comma-separated proxy header, lowercased. */
function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim().toLowerCase();
  return first ? first : null;
}
