import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { Pool } from "pg";
import {
  ACTIVATION_KEY_ALPHABET,
  ACTIVATION_KEY_GROUPS,
  ACTIVATION_KEY_GROUP_SIZE,
  ACTIVATION_KEY_PREFIX,
  activationKeyHint,
  formatActivationKey,
} from "./activation-keys";
import { amountsMatch, type ActivationPaymentStatus, type ActivationPurchase } from "./activation-purchase";
import { readBinancePayConfig } from "./binance-pay";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS activation_keys (
     id TEXT PRIMARY KEY, label TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
     key_hint TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT,
     last_used_at TEXT, use_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS activation_keys_created ON activation_keys (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS activation_purchases (
     purchase_id TEXT PRIMARY KEY, merchant_trade_no TEXT NOT NULL UNIQUE,
     telegram_user_id BIGINT NOT NULL, amount TEXT NOT NULL, currency TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('created', 'paid', 'expired', 'failed')),
     prepay_id TEXT, checkout_url TEXT, deeplink TEXT, universal_url TEXT,
     qr_content TEXT, qrcode_link TEXT, transaction_id TEXT, key_hint TEXT,
     key_ciphertext TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
     paid_at TEXT, updated_at TEXT NOT NULL, last_status_check_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS activation_purchases_by_user
     ON activation_purchases (telegram_user_id, created_at DESC)`,
];

type DbGlobal = typeof globalThis & { __adunityPurchasePool?: Pool; __adunityPurchaseSchema?: Promise<void> };
type PurchaseRow = {
  purchase_id: string; merchant_trade_no: string; telegram_user_id: string; amount: string; currency: string;
  status: "created" | "paid" | "expired" | "failed"; prepay_id: string | null; checkout_url: string | null;
  deeplink: string | null; universal_url: string | null; qr_content: string | null; qrcode_link: string | null;
  transaction_id: string | null; key_hint: string | null; key_ciphertext: string | null;
  created_at: string; expires_at: string; paid_at: string | null; updated_at: string;
};
const COLUMNS = `purchase_id, merchant_trade_no, telegram_user_id, amount, currency, status, prepay_id,
 checkout_url, deeplink, universal_url, qr_content, qrcode_link, transaction_id, key_hint,
 key_ciphertext, created_at, expires_at, paid_at, updated_at`;

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("database_not_configured");
  const scope = globalThis as DbGlobal;
  return (scope.__adunityPurchasePool ??= new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000 }));
}
async function ready(): Promise<Pool> {
  const pool = getPool();
  const scope = globalThis as DbGlobal;
  if (!scope.__adunityPurchaseSchema) {
    const setup = (async () => { for (const statement of SCHEMA) await pool.query(statement); })();
    scope.__adunityPurchaseSchema = setup;
    void setup.catch(() => { if (scope.__adunityPurchaseSchema === setup) scope.__adunityPurchaseSchema = undefined; });
  }
  await scope.__adunityPurchaseSchema;
  return pool;
}
function paymentKey(): Buffer {
  const config = readBinancePayConfig();
  if (!config.ok) throw new Error("server_not_configured");
  return createHash("sha256").update("adunity:activation-purchase:v1:").update(config.config.secret).digest();
}
function encryptKey(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", paymentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}
function decryptKey(value: string): string {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("invalid_key_ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", paymentKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
function publicStatus(status: PurchaseRow["status"]): ActivationPaymentStatus {
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  if (status === "failed") return "closed";
  return "pending";
}
export function mapActivationPurchase(row: PurchaseRow): ActivationPurchase {
  return {
    id: row.purchase_id, status: publicStatus(row.status), amount: row.amount, currency: row.currency,
    checkoutUrl: row.checkout_url ?? "", deeplink: row.deeplink ?? "", universalUrl: row.universal_url ?? "",
    qrContent: row.qr_content ?? "", qrcodeLink: row.qrcode_link ?? "", expiresAt: row.expires_at,
    paidAt: row.paid_at, keyHint: row.key_hint,
  };
}

export async function createActivationPurchase(input: {
  userId: number; amount: string; currency: string; merchantTradeNo: string; purchaseId: string; expiresAt: string;
}): Promise<ActivationPurchase> {
  const pool = await ready();
  const now = new Date().toISOString();
  const result = await pool.query<PurchaseRow>(
    `INSERT INTO activation_purchases
       (purchase_id, merchant_trade_no, telegram_user_id, amount, currency, status, created_at, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'created', $6, $7, $6) RETURNING ${COLUMNS}`,
    [input.purchaseId, input.merchantTradeNo, input.userId, input.amount, input.currency, now, input.expiresAt],
  );
  return mapActivationPurchase(result.rows[0]);
}

export async function findActivationPurchase(purchaseId: string, userId: number): Promise<ActivationPurchase | null> {
  const pool = await ready();
  const result = await pool.query<PurchaseRow>(
    `SELECT ${COLUMNS} FROM activation_purchases WHERE purchase_id = $1 AND telegram_user_id = $2`,
    [purchaseId, userId],
  );
  return result.rows[0] ? mapActivationPurchase(result.rows[0]) : null;
}

export async function updateActivationCheckout(input: {
  purchaseId: string; userId: number; prepayId: string; checkoutUrl: string; deeplink: string;
  universalUrl: string; qrContent: string; qrcodeLink: string; expiresAt: string;
}): Promise<ActivationPurchase | null> {
  const pool = await ready();
  const result = await pool.query<PurchaseRow>(
    `UPDATE activation_purchases SET prepay_id=$3, checkout_url=$4, deeplink=$5, universal_url=$6,
       qr_content=$7, qrcode_link=$8, expires_at=$9, updated_at=$10
     WHERE purchase_id=$1 AND telegram_user_id=$2 AND status='created' RETURNING ${COLUMNS}`,
    [input.purchaseId, input.userId, input.prepayId, input.checkoutUrl, input.deeplink,
      input.universalUrl, input.qrContent, input.qrcodeLink, input.expiresAt, new Date().toISOString()],
  );
  return result.rows[0] ? mapActivationPurchase(result.rows[0]) : null;
}

export async function failActivationPurchase(purchaseId: string): Promise<void> {
  const pool = await ready();
  await pool.query(`UPDATE activation_purchases SET status='failed', updated_at=$2 WHERE purchase_id=$1 AND status='created'`,
    [purchaseId, new Date().toISOString()]);
}

export async function claimActivationStatusRefresh(purchaseId: string, userId: number, minIntervalMs: number): Promise<string | null> {
  const pool = await ready();
  const result = await pool.query<{ merchant_trade_no: string }>(
    `UPDATE activation_purchases SET last_status_check_at=$3
     WHERE purchase_id=$1 AND telegram_user_id=$2 AND status='created'
       AND (last_status_check_at IS NULL OR last_status_check_at::timestamptz < $3::timestamptz - ($4 * INTERVAL '1 millisecond'))
     RETURNING merchant_trade_no`,
    [purchaseId, userId, new Date().toISOString(), minIntervalMs],
  );
  return result.rows[0]?.merchant_trade_no ?? null;
}

export async function applyActivationOrderStatus(tradeNo: string, status: "expired" | "failed"): Promise<void> {
  const pool = await ready();
  await pool.query(`UPDATE activation_purchases SET status=$2, updated_at=$3 WHERE merchant_trade_no=$1 AND status='created'`,
    [tradeNo, status, new Date().toISOString()]);
}

export type ActivationFulfillmentResult =
  | { ok: true; alreadyPaid: boolean; keyHint: string | null }
  | { ok: false; reason: "not_found" | "payment_mismatch" | "transaction_mismatch" };

/** Inserts the key digest and confirms payment atomically under an order-row lock. */
export async function fulfillActivationPurchase(input: {
  merchantTradeNo: string; amount: string; currency: string; transactionId: string; paidAt: string;
}): Promise<ActivationFulfillmentResult> {
  const pool = await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<PurchaseRow>(
      `SELECT ${COLUMNS} FROM activation_purchases WHERE merchant_trade_no=$1 FOR UPDATE`, [input.merchantTradeNo]);
    const row = selected.rows[0];
    if (!row) { await client.query("ROLLBACK"); return { ok: false, reason: "not_found" }; }
    if (!amountsMatch(row.amount, input.amount) || row.currency !== input.currency) {
      await client.query("ROLLBACK"); return { ok: false, reason: "payment_mismatch" };
    }
    if (row.status === "paid") {
      if (row.transaction_id !== input.transactionId) {
        await client.query("ROLLBACK"); return { ok: false, reason: "transaction_mismatch" };
      }
      await client.query("COMMIT"); return { ok: true, alreadyPaid: true, keyHint: row.key_hint };
    }
    if (row.status !== "created") {
      await client.query("ROLLBACK"); return { ok: false, reason: "payment_mismatch" };
    }
    const normalized = newSecret();
    const secret = formatActivationKey(normalized);
    const hint = activationKeyHint(normalized);
    const keyId = `act_${randomBytes(9).toString("base64url")}`;
    const now = new Date().toISOString();
    const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
    await client.query(
      `INSERT INTO activation_keys (id,label,key_hash,key_hint,created_at,revoked_at,last_used_at,use_count)
       VALUES ($1,$2,$3,$4,$5,NULL,NULL,0)`,
      [keyId, `Binance Pay purchase ${row.purchase_id}`, digest, hint, now]);
    await client.query(
      `UPDATE activation_purchases SET status='paid', transaction_id=$2, key_hint=$3,
       key_ciphertext=$4, paid_at=$5, updated_at=$5 WHERE purchase_id=$1`,
      [row.purchase_id, input.transactionId, hint, encryptKey(secret), input.paidAt]);
    await client.query("COMMIT");
    return { ok: true, alreadyPaid: false, keyHint: hint };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function consumeActivationPurchaseKey(
  purchaseId: string, userId: number,
): Promise<{ secret: string; hint: string } | null> {
  const pool = await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<PurchaseRow>(
      `SELECT ${COLUMNS} FROM activation_purchases
       WHERE purchase_id=$1 AND telegram_user_id=$2 AND status='paid' FOR UPDATE`, [purchaseId, userId]);
    const row = result.rows[0];
    if (!row?.key_ciphertext || !row.key_hint) { await client.query("COMMIT"); return null; }
    const secret = decryptKey(row.key_ciphertext);
    await client.query(`UPDATE activation_purchases SET key_ciphertext=NULL, updated_at=$2 WHERE purchase_id=$1`,
      [purchaseId, new Date().toISOString()]);
    await client.query("COMMIT");
    return { secret, hint: row.key_hint };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function newSecret(): string {
  let body = "";
  for (let index=0; index<ACTIVATION_KEY_GROUPS*ACTIVATION_KEY_GROUP_SIZE; index+=1) {
    body += ACTIVATION_KEY_ALPHABET[randomInt(ACTIVATION_KEY_ALPHABET.length)];
  }
  return `${ACTIVATION_KEY_PREFIX}${body}`;
}
