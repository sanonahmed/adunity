import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { TelegramUser } from "./telegram";
import {
  computeReferralEarnings,
  parseReferralCode,
  REFERRAL_CODE_LENGTH,
  REFERRAL_RECENT_LIMIT,
  summariseActivity,
  type ReferralRecord,
  type ReferralSummary,
} from "./referral";

/** Neon PostgreSQL is the only referral store; missing config fails closed. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    referral_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS referrals (
    referred_telegram_id BIGINT PRIMARY KEY,
    referrer_telegram_id BIGINT NOT NULL REFERENCES users (telegram_id),
    code TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS referrals_by_referrer ON referrals (referrer_telegram_id);
`;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
type DbGlobal = typeof globalThis & {
  __adunityReferralPool?: Pool;
  __adunityReferralSchema?: Promise<void>;
};
type UserRow = { telegram_id: string; referral_code: string; created_at: string };
type InviteRow = { created_at: string };

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("database_not_configured");
  const scope = globalThis as DbGlobal;
  return (scope.__adunityReferralPool ??= new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }));
}

async function ensureSchema(pool: Pool): Promise<void> {
  const scope = globalThis as DbGlobal;
  if (!scope.__adunityReferralSchema) {
    const setup = SCHEMA.split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .reduce(
        (previous, statement) => previous.then(() => pool.query(statement).then(() => undefined)),
        Promise.resolve(),
      );
    scope.__adunityReferralSchema = setup;
    void setup.catch(() => {
      if (scope.__adunityReferralSchema === setup) scope.__adunityReferralSchema = undefined;
    });
  }
  await scope.__adunityReferralSchema;
}

function randomCode(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let code = "";
  while (code.length < REFERRAL_CODE_LENGTH) {
    for (const byte of randomBytes(REFERRAL_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === REFERRAL_CODE_LENGTH) break;
    }
  }
  return code;
}

async function readRank(client: PoolClient, invitedCount: number) {
  if (invitedCount <= 0) return { rank: null, referrers: 0 };
  const result = await client.query<{ ahead: number; referrers: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM (
          SELECT referrer_telegram_id FROM referrals
          GROUP BY referrer_telegram_id HAVING COUNT(*) > $1
        ) ranked) AS ahead,
       (SELECT COUNT(DISTINCT referrer_telegram_id)::int FROM referrals) AS referrers`,
    [invitedCount],
  );
  return {
    rank: Number(result.rows[0]?.ahead ?? 0) + 1,
    referrers: Number(result.rows[0]?.referrers ?? 0),
  };
}

async function readSummary(
  client: PoolClient,
  telegramId: number,
): Promise<ReferralSummary | null> {
  const users = await client.query<UserRow>(
    "SELECT telegram_id, referral_code, created_at FROM users WHERE telegram_id = $1",
    [telegramId],
  );
  const user = users.rows[0];
  if (!user) return null;

  const invites = await client.query<InviteRow>(
    `SELECT created_at FROM referrals WHERE referrer_telegram_id = $1
     ORDER BY created_at DESC, referred_telegram_id DESC`,
    [telegramId],
  );
  const rows = invites.rows;
  const invitedCount = rows.length;
  const recent: ReferralRecord[] = rows
    .slice(0, REFERRAL_RECENT_LIMIT)
    .map((row, index) => ({ index: invitedCount - index, joinedAt: row.created_at }));
  const { rank, referrers } = await readRank(client, invitedCount);
  return {
    code: user.referral_code,
    invitedCount,
    joinedAt: user.created_at,
    recent,
    stats: {
      ...summariseActivity(rows.map((row) => row.created_at), new Date()),
      rank,
      referrers,
    },
    // Referral attribution exists, but the app does not yet ingest ad revenue.
    rewards: computeReferralEarnings(null),
  };
}

export type RecordVisitResult = {
  summary: ReferralSummary;
  created: boolean;
  attributed: boolean;
};

/** Account creation and first-touch attribution commit atomically. */
export async function recordVisit(
  user: TelegramUser,
  startParam: string | null,
): Promise<RecordVisitResult> {

  const pool = getPool();
  await ensureSchema(pool);
  const client = await pool.connect();
  const now = new Date().toISOString();
  let created = false;
  let attributed = false;
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE", [user.id]);
    if (existing.rowCount === 0) {
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        const result = await client.query(
          `INSERT INTO users (telegram_id, referral_code, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING RETURNING telegram_id`,
          [user.id, randomCode(), now],
        );
        inserted = result.rowCount === 1;
      }
      if (!inserted) {
        const concurrent = await client.query("SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE", [user.id]);
        if (concurrent.rowCount === 0) throw new Error("referral_code_collision");
      } else created = true;
    }
    const code = parseReferralCode(startParam);
    if (code) {
      const referrer = await client.query<{ telegram_id: string }>("SELECT telegram_id FROM users WHERE referral_code = $1", [code]);
      const referrerId = referrer.rows[0]?.telegram_id;
      if (referrerId && referrerId !== String(user.id)) {
        const result = await client.query(
          `INSERT INTO referrals (referred_telegram_id, referrer_telegram_id, code, created_at)
           VALUES ($1, $2, $3, $4) ON CONFLICT (referred_telegram_id) DO NOTHING
           RETURNING referred_telegram_id`,
          [user.id, referrerId, code, now],
        );
        attributed = result.rowCount === 1;
      }
    }
    const summary = await readSummary(client, user.id);
    if (!summary) throw new Error("user_missing_after_write");
    await client.query("COMMIT");
    return { summary, created, attributed };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
