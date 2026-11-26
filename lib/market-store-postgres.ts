import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { BuyerInput, BuyerRequest, BuyerRequirement, BuyerStatus } from "./market";

/**
 * Postgres is the single source of truth for market listings. The schema is
 * created on first use (same pattern as the referral store) so a fresh Neon
 * database needs no manual migration step.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS market_buyers (
     id TEXT PRIMARY KEY,
     buyer_name TEXT NOT NULL,
     verified BOOLEAN NOT NULL DEFAULT FALSE,
     item TEXT NOT NULL,
     quantity INTEGER NOT NULL,
     fulfilled INTEGER NOT NULL DEFAULT 0,
     requirement TEXT NOT NULL,
     budget_per_account_bdt INTEGER NOT NULL,
     note TEXT,
     telegram_username TEXT,
     status TEXT NOT NULL DEFAULT 'open',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  /* Older installs predate delivery tracking; the default keeps every row valid. */
  `ALTER TABLE market_buyers
     ADD COLUMN IF NOT EXISTS fulfilled INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS market_buyers_status_created
     ON market_buyers (status, created_at DESC)`,
  /* One guarded block so a re-run never duplicates the constraint, and a
     constraint owned by another table can never be mistaken for ours. */
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'market_buyers_fulfilled_range'
         AND conrelid = 'market_buyers'::regclass
     ) THEN
       ALTER TABLE market_buyers
         ADD CONSTRAINT market_buyers_fulfilled_range
         CHECK (fulfilled >= 0 AND fulfilled <= quantity) NOT VALID;
       /* Validates the rows inserted before the column existed (all zeroes). */
       ALTER TABLE market_buyers VALIDATE CONSTRAINT market_buyers_fulfilled_range;
     END IF;
   END $$`,
];

type DbGlobal = typeof globalThis & {
  __adunityMarketPool?: Pool;
  __adunityMarketSchema?: Promise<void>;
  __adunityMarketSeeded?: boolean;
};

type BuyerRow = {
  id: string;
  buyer_name: string;
  verified: boolean;
  item: string;
  quantity: number;
  fulfilled: number;
  requirement: string;
  budget_per_account_bdt: number;
  note: string | null;
  telegram_username: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Fictional starters so a fresh install has something to manage. */
const DEMO_SEED: ReadonlyArray<{
  id: string;
  buyer: string;
  verified: boolean;
  quantity: number;
  /** Illustrative head start so the progress bars are not all empty. */
  fulfilled: number;
  requirement: BuyerRequirement;
  budget: number;
  minutesAgo: number;
}> = [
  { id: "demo-buyer-01", buyer: "Rafi Ahmed", verified: true, quantity: 25, fulfilled: 18, requirement: "Phone verified", budget: 180, minutesAgo: 4 },
  { id: "demo-buyer-02", buyer: "Nadia Karim", verified: true, quantity: 10, fulfilled: 7, requirement: "Aged", budget: 260, minutesAgo: 11 },
  { id: "demo-buyer-03", buyer: "Tanvir Hasan", verified: false, quantity: 50, fulfilled: 12, requirement: "Fresh", budget: 120, minutesAgo: 26 },
  { id: "demo-buyer-04", buyer: "Sadia Islam", verified: true, quantity: 5, fulfilled: 4, requirement: "Phone verified", budget: 210, minutesAgo: 42 },
  { id: "demo-buyer-05", buyer: "Imran Chowdhury", verified: false, quantity: 100, fulfilled: 31, requirement: "Fresh", budget: 95, minutesAgo: 60 },
  { id: "demo-buyer-06", buyer: "Mehedi Rahman", verified: true, quantity: 15, fulfilled: 6, requirement: "Aged", budget: 240, minutesAgo: 120 },
];

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("database_not_configured");
  const scope = globalThis as DbGlobal;
  return (scope.__adunityMarketPool ??= new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }));
}

async function ensureSchema(pool: Pool): Promise<void> {
  const scope = globalThis as DbGlobal;
  if (!scope.__adunityMarketSchema) {
    const setup = (async () => {
      /* Detect the upgrade before the ALTER runs, so the demo rows can be given
         a believable head start exactly once on existing databases. */
      const existing = await pool.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'market_buyers'
             AND column_name = 'fulfilled'
         ) AS present`,
      );
      const addedFulfilled = !existing.rows[0]?.present;

      for (const statement of SCHEMA) await pool.query(statement);
      if (addedFulfilled) await seedDemoProgress(pool);
    })();

    scope.__adunityMarketSchema = setup;
    void setup.catch(() => {
      if (scope.__adunityMarketSchema === setup) scope.__adunityMarketSchema = undefined;
    });
  }
  await scope.__adunityMarketSchema;
}

/** Gives the fictional starter rows progress once, when the column is introduced. */
async function seedDemoProgress(pool: Pool): Promise<void> {
  for (const seed of DEMO_SEED) {
    await pool.query(
      `UPDATE market_buyers SET fulfilled = LEAST(quantity, $2)
       WHERE id = $1 AND fulfilled = 0`,
      [seed.id, seed.fulfilled],
    );
  }
}

/** Seeds the fictional starter rows once, and only while the table is empty. */
async function seedDemoRows(pool: Pool): Promise<void> {
  const scope = globalThis as DbGlobal;
  if (scope.__adunityMarketSeeded) return;
  if (process.env.MARKET_SEED_DEMO === "false") {
    scope.__adunityMarketSeeded = true;
    return;
  }
  const count = await pool.query<{ total: number }>("SELECT COUNT(*)::int AS total FROM market_buyers");
  if (Number(count.rows[0]?.total ?? 0) === 0) {
    const now = Date.now();
    for (const seed of DEMO_SEED) {
      const createdAt = new Date(now - seed.minutesAgo * 60_000).toISOString();
      await pool.query(
        `INSERT INTO market_buyers
           (id, buyer_name, verified, item, quantity, fulfilled, requirement,
            budget_per_account_bdt, note, telegram_username, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, 'open', $9, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          seed.id,
          seed.buyer,
          seed.verified,
          "Gmail accounts",
          seed.quantity,
          seed.fulfilled,
          seed.requirement,
          seed.budget,
          createdAt,
        ],
      );
    }
  }
  scope.__adunityMarketSeeded = true;
}

async function ready(): Promise<Pool> {
  const pool = getPool();
  await ensureSchema(pool);
  await seedDemoRows(pool);
  return pool;
}

/**
 * `ensureSchema` caches its promise per process, so a dev server that hot-replaced
 * this module after a column was added keeps the stale "schema done" promise and
 * every query fails with `42703`. Re-running the idempotent DDL once fixes that,
 * and costs nothing on the normal path.
 */
async function withSchemaRetry<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = await ready();
  try {
    return await run(pool);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "42703") throw error;
    (globalThis as DbGlobal).__adunityMarketSchema = undefined;
    return run(await ready());
  }
}

function mapRow(row: BuyerRow): BuyerRequest {
  return {
    id: row.id,
    buyer: row.buyer_name,
    verified: row.verified,
    item: row.item,
    quantity: row.quantity,
    fulfilled: row.fulfilled,
    requirement: row.requirement as BuyerRequirement,
    budgetPerAccountBdt: row.budget_per_account_bdt,
    note: row.note,
    telegramUsername: row.telegram_username,
    status: row.status as BuyerStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `id, buyer_name, verified, item, quantity, fulfilled, requirement,
  budget_per_account_bdt, note, telegram_username, status, created_at, updated_at`;

/** Public scope returns only open listings with admin-only fields stripped. */
export type BuyerScope = "public" | "admin";

export async function listBuyers(scope: BuyerScope): Promise<BuyerRequest[]> {
  const rows = await withSchemaRetry(async (pool) => {
    const result =
      scope === "admin"
        ? await pool.query<BuyerRow>(
            `SELECT ${SELECT_COLUMNS} FROM market_buyers ORDER BY created_at DESC LIMIT 500`,
          )
        : await pool.query<BuyerRow>(
            `SELECT ${SELECT_COLUMNS} FROM market_buyers
             WHERE status = 'open' ORDER BY created_at DESC LIMIT 50`,
          );
    return result.rows.map(mapRow);
  });

  if (scope === "admin") return rows;
  return rows.map((row) => ({ ...row, note: null, telegramUsername: null }));
}

function newId(): string {
  return `byr_${randomBytes(9).toString("base64url")}`;
}

export async function createBuyer(input: BuyerInput): Promise<BuyerRequest> {
  const now = new Date().toISOString();
  return withSchemaRetry(async (pool) => {
    const result = await pool.query<BuyerRow>(
      `INSERT INTO market_buyers
         (id, buyer_name, verified, item, quantity, fulfilled, requirement, budget_per_account_bdt,
          note, telegram_username, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       RETURNING ${SELECT_COLUMNS}`,
      [
        newId(),
        input.buyer,
        input.verified,
        input.item,
        input.quantity,
        input.fulfilled,
        input.requirement,
        input.budgetPerAccountBdt,
        input.note,
        input.telegramUsername,
        input.status,
        now,
      ],
    );
    return mapRow(result.rows[0]);
  });
}

export async function updateBuyer(id: string, input: BuyerInput): Promise<BuyerRequest | null> {
  const now = new Date().toISOString();
  return withSchemaRetry(async (pool) => {
    const result = await pool.query<BuyerRow>(
      `UPDATE market_buyers SET
         buyer_name = $2, verified = $3, item = $4, quantity = $5, fulfilled = $6,
         requirement = $7, budget_per_account_bdt = $8, note = $9, telegram_username = $10,
         status = $11, updated_at = $12
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        id,
        input.buyer,
        input.verified,
        input.item,
        input.quantity,
        input.fulfilled,
        input.requirement,
        input.budgetPerAccountBdt,
        input.note,
        input.telegramUsername,
        input.status,
        now,
      ],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function setBuyerStatus(id: string, status: BuyerStatus): Promise<BuyerRequest | null> {
  const now = new Date().toISOString();
  return withSchemaRetry(async (pool) => {
    const result = await pool.query<BuyerRow>(
      `UPDATE market_buyers SET status = $2, updated_at = $3
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, status, now],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}
