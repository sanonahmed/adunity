import { createPublicKey, verify } from "node:crypto";
import {
  BINANCE_PAY_CERTIFICATES_NEW_PATH,
  binancePayNonce,
  buildBinancePayPayload,
  binancePayRequestSignature,
  type BinancePayConfig,
} from "./binance-pay";

export type BinanceApiEnvelope<T> = {
  status?: string;
  code?: string;
  data?: T;
  errorMessage?: string;
};

/** Sign and send one exact JSON body immediately (Binance has a 1s window). */
export async function callBinancePay<T>(
  config: BinancePayConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<BinanceApiEnvelope<T>> {
  const timestamp = String(Date.now());
  const nonce = binancePayNonce();
  const bodyText = JSON.stringify(body);
  const signature = binancePayRequestSignature(
    buildBinancePayPayload(timestamp, nonce, bodyText),
    config.secret,
  );
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": config.apiKey,
      "BinancePay-Signature": signature,
    },
    body: bodyText,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`binance_http_${response.status}`);
  const result: unknown = await response.json();
  if (!isRecord(result)) throw new Error("binance_invalid_response");
  return result as BinanceApiEnvelope<T>;
}

export type BinancePayCertificate = { certSerial: string; certPublic: string };
type CertificateCache = { at: number; certificates: Map<string, string> };
type CertificateGlobal = typeof globalThis & { __adunityPayCertificates?: CertificateCache };
const CERTIFICATE_TTL_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_SERIAL_RETRY_MS = 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function refreshCertificates(config: BinancePayConfig): Promise<CertificateCache> {
  const result = await callBinancePay<unknown>(config, BINANCE_PAY_CERTIFICATES_NEW_PATH, {});
  if (result.status !== "SUCCESS" || !Array.isArray(result.data)) {
    throw new Error("binance_certificates_unavailable");
  }
  const certificates = new Map<string, string>();
  for (const item of result.data) {
    if (!isRecord(item)) continue;
    if (
      typeof item.certSerial === "string" && /^[A-F0-9]{32}$/.test(item.certSerial) &&
      typeof item.certPublic === "string" && item.certPublic.includes("BEGIN PUBLIC KEY")
    ) {
      certificates.set(item.certSerial, item.certPublic);
    }
  }
  const cache = { at: Date.now(), certificates };
  (globalThis as CertificateGlobal).__adunityPayCertificates = cache;
  return cache;
}

/** Verify the current RSA-SHA256 webhook signature; never downgrade to legacy headers. */
export async function verifyBinancePayWebhook(
  config: BinancePayConfig,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const timestamp = headers.get("BinancePay-Timestamp");
  const nonce = headers.get("BinancePay-Nonce");
  const serial = headers.get("BinancePay-Certificate-SN-New");
  const signature = headers.get("BinancePay-Signature-New");
  if (
    !timestamp || !/^\d{10,16}$/.test(timestamp) ||
    !nonce || !/^[A-Za-z0-9]{32}$/.test(nonce) ||
    !serial || !/^[A-F0-9]{32}$/.test(serial) ||
    !signature || signature.length > 2048
  ) return false;

  const scope = globalThis as CertificateGlobal;
  let cache = scope.__adunityPayCertificates;
  const now = Date.now();
  if (!cache || now - cache.at >= CERTIFICATE_TTL_MS) {
    cache = await refreshCertificates(config);
  }
  let publicPem = cache.certificates.get(serial);
  if (!publicPem && now - cache.at >= UNKNOWN_SERIAL_RETRY_MS) {
    cache = await refreshCertificates(config);
    publicPem = cache.certificates.get(serial);
  }
  if (!publicPem) return false;

  try {
    const payload = buildBinancePayPayload(timestamp, nonce, rawBody);
    return verify("RSA-SHA256", Buffer.from(payload, "utf8"), createPublicKey(publicPem), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
