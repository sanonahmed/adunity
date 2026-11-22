import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TelegramUser } from "./telegram";
import {
  parseReferralCode,
  REFERRAL_CODE_LENGTH,
  type ReferralRecord,
  type ReferralSummary,
} from "./referral";

/**
 * Server-only persistence for referral records.
 *
 * Uses the SQLite engine bundled with Node (`node:sqlite`), so there is no
 * native build step and no extra dependency. A single file holds the data:
 * point `ADUNITY_DB_PATH` at a persistent volume in production.
 *
 * Node's SQLite bindings are synchronous; that is fine for this workload and
 * keeps the schema/transaction logic readable. Statements are cached per
 * connection, and the connection survives dev-server HMR via `globalThis`.
 *
 * Only Telegram ids, referral codes and referral timestamps are persisted;
 * profile names/usernames are neither necessary for counts nor shared with
 * referrers. Recent sign-ups therefore use a generic label.
 *
 * Limitations this file does not hide:
 *   - Serverless hosts with an ephemeral filesystem cannot keep this file.
 *     Use a host with a persistent disk, or replace this module with a
 *     Postgres-backed implementation of the same functions.
 *   - No payout/reward ledger exists, so nothing here credits earnings.
 */

/** 31 unambiguous characters: excludes I, L, O, 0 and 1. */
const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const DEFAULT_DB_PATH = join(process.cwd(), ".data", "adunity.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    referral_code TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS referrals (
    referred_telegram_id INTEGER PRIMARY KEY,
    referrer_telegram_id INTEGER NOT NULL,
    code        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (referrer_telegram_id) REFERENCES users (telegram_id)
  );

  CREATE INDEX IF NOT EXISTS referrals_by_referrer
    ON referrals (referrer_telegram_id);
`;

type GlobalWithDb = typeof globalThis & { __adunityReferralDb?: DatabaseSync };

function openDatabase(): DatabaseSync {
  const file = process.env.ADUNITY_DB_PATH?.trim() || DEFAULT_DB_PATH;

  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  /* WAL keeps reads working while a write is in flight; the busy timeout
     covers the brief lock contention of two simultaneous first visits. */
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  /* Earlier local builds stored profile labels. They are unnecessary for
     attribution and are removed from existing databases on upgrade. */
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const existingColumns = new Set(userColumns.map((column) => column.name));
  for (const column of ["first_name", "last_name", "username", "updated_at"] as const) {
    if (existingColumns.has(column)) {
      db.exec(`ALTER TABLE users DROP COLUMN ${column}`);
    }
  }

  return db;
}

function getDb(): DatabaseSync {
  const scope = globalThis as GlobalWithDb;
  if (!scope.__adunityReferralDb) {
    scope.__adunityReferralDb = openDatabase();
  }
  return scope.__adunityReferralDb;
}

function randomCode(): string {
  /* 256 % 31 leaves 8 biased byte values; reject them to keep each
     character uniformly random. */
  const acceptedByteLimit = Math.floor(256 / REFERRAL_ALPHABET.length) * REFERRAL_ALPHABET.length;
  let code = "";
  while (code.length < REFERRAL_CODE_LENGTH) {
    for (const byte of randomBytes(REFERRAL_CODE_LENGTH * 2)) {
      if (byte >= acceptedByteLimit) continue;
      code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
      if (code.length === REFERRAL_CODE_LENGTH) break;
    }
  }
  return code;
}

function uniqueCode(db: DatabaseSync): string {
  const exists = db.prepare("SELECT 1 AS hit FROM users WHERE referral_code = ?");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomCode();
    if (!exists.get(candidate)) return candidate;
  }
  throw new Error("referral_code_collision");
}

type UserRow = {
  telegram_id: number;
  referral_code: string;
  created_at: string;
};

function readSummary(db: DatabaseSync, telegramId: number): ReferralSummary | null {
  const user = db
    .prepare("SELECT telegram_id, referral_code, created_at FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow | undefined;

  if (!user) return null;

  const count = db
    .prepare("SELECT COUNT(*) AS invited FROM referrals WHERE referrer_telegram_id = ?")
    .get(telegramId) as { invited: number } | undefined;

  const recent = db
    .prepare(
      `SELECT r.created_at
         FROM referrals r
        WHERE r.referrer_telegram_id = ?
        ORDER BY r.created_at DESC
        LIMIT 5`,
    )
    .all(telegramId) as Array<{ created_at: string }>;

  const records: ReferralRecord[] = recent.map((row) => ({
    name: "Verified Telegram user",
    joinedAt: row.created_at,
  }));

  return {
    code: user.referral_code,
    invitedCount: count?.invited ?? 0,
    joinedAt: user.created_at,
    recent: records,
    rewardsConfigured: false,
  };
}

export type RecordVisitResult = {
  summary: ReferralSummary;
  /** True when this request created the account row. */
  created: boolean;
  /** True when the signed start parameter attributed a new invitee. */
  attributed: boolean;
};

/**
 * Record a verified visit and, on first contact only, attribute the invite.
 *
 * Rules, all enforced here rather than in the UI:
 *   - first seen wins: an existing account is never re-attributed;
 *   - one referrer per invitee (`referred_telegram_id` is the primary key);
 *   - self-referral is ignored;
 *   - a start parameter naming an unknown code is ignored.
 */
export function recordVisit(
  user: TelegramUser,
  startParam: string | null,
): RecordVisitResult {
  const db = getDb();
  const now = new Date().toISOString();
  const telegramId = user.id;

  /* Serialize the first-seen check, user insert and attribution. This protects
     against parallel requests/processes and prevents partial attribution if a
     later insert fails. `busy_timeout` above handles another worker's lock. */
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db
      .prepare("SELECT telegram_id, referral_code, created_at FROM users WHERE telegram_id = ?")
      .get(telegramId) as UserRow | undefined;

    const created = !existing;
    if (created) {
      db.prepare(
        `INSERT INTO users (telegram_id, referral_code, created_at)
         VALUES (?, ?, ?)`,
      ).run(
        telegramId,
        uniqueCode(db),
        now,
      );
    }

    let attributed = false;
    const code = created ? parseReferralCode(startParam) : null;

    if (code) {
      const referrer = db
        .prepare("SELECT telegram_id FROM users WHERE referral_code = ?")
        .get(code) as { telegram_id: number } | undefined;

      if (referrer && referrer.telegram_id !== telegramId) {
        const inserted = db
          .prepare(
            `INSERT OR IGNORE INTO referrals (referred_telegram_id, referrer_telegram_id, code, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(telegramId, referrer.telegram_id, code, now);
        attributed = Number(inserted.changes) > 0;
      }
    }

    const summary = readSummary(db, telegramId);
    if (!summary) throw new Error("user_missing_after_write");

    db.exec("COMMIT");
    return { summary, created, attributed };
  } catch (error) {
    /* Preserve the original failure even if rollback itself reports an error. */
    try {
      db.exec("ROLLBACK");
    } catch {
      /* Transaction may already have been rolled back by SQLite. */
    }
    throw error;
  }
}
