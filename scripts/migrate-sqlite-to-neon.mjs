import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { resolve } from "node:path";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("Set DATABASE_URL to your Neon PostgreSQL connection string.");
  process.exit(1);
}
const sqlitePath = resolve(process.env.SQLITE_FILE?.trim() || ".data/adunity.sqlite");
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

const schema = `
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

try {
  const users = sqlite.prepare("SELECT telegram_id, referral_code, created_at FROM users ORDER BY telegram_id").all();
  const referrals = sqlite.prepare("SELECT referred_telegram_id, referrer_telegram_id, code, created_at FROM referrals ORDER BY created_at, referred_telegram_id").all();
  console.log(`Read-only SQLite source: ${sqlitePath}\nUsers: ${users.length}; referrals: ${referrals.length}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) {
      await client.query(statement);
    }
    for (const user of users) {
      const existing = await client.query("SELECT referral_code, created_at FROM users WHERE telegram_id = $1", [user.telegram_id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.referral_code !== user.referral_code || row.created_at !== user.created_at) {
          throw new Error(`Existing Neon account conflicts with SQLite account ${user.telegram_id}; no rows imported.`);
        }
      } else {
        await client.query("INSERT INTO users (telegram_id, referral_code, created_at) VALUES ($1, $2, $3)", [user.telegram_id, user.referral_code, user.created_at]);
      }
    }
    for (const referral of referrals) {
      const existing = await client.query("SELECT referrer_telegram_id, code, created_at FROM referrals WHERE referred_telegram_id = $1", [referral.referred_telegram_id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (String(row.referrer_telegram_id) !== String(referral.referrer_telegram_id) || row.code !== referral.code || row.created_at !== referral.created_at) {
          throw new Error(`Existing Neon attribution conflicts with SQLite invitee ${referral.referred_telegram_id}; no rows imported.`);
        }
      } else {
        await client.query(
          "INSERT INTO referrals (referred_telegram_id, referrer_telegram_id, code, created_at) VALUES ($1, $2, $3, $4)",
          [referral.referred_telegram_id, referral.referrer_telegram_id, referral.code, referral.created_at],
        );
      }
    }
    const counts = await client.query("SELECT (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM referrals) AS referrals");
    await client.query("COMMIT");
    console.log(`Import complete. Neon now has ${counts.rows[0].users} users and ${counts.rows[0].referrals} referrals.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  sqlite.close();
  await pool.end();
}
