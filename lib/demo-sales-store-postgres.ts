import { Pool } from "pg";
import type { DemoSaleRecord } from "./market";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS demo_sales (
     telegram_id BIGINT NOT NULL,
     id TEXT NOT NULL,
     buyer_id TEXT NOT NULL,
     buyer TEXT NOT NULL,
     quantity INTEGER NOT NULL CHECK (quantity > 0),
     amount_bdt BIGINT NOT NULL CHECK (amount_bdt >= 0),
     created_at TEXT NOT NULL,
     PRIMARY KEY (telegram_id, id)
   )`,
  `CREATE INDEX IF NOT EXISTS demo_sales_by_user_created
     ON demo_sales (telegram_id, created_at DESC)`,
  /* Prevents a replayed browser-storage payload from inflating the demo balance. */
  `CREATE TABLE IF NOT EXISTS demo_sales_migrations (
     telegram_id BIGINT PRIMARY KEY,
     imported_at TEXT NOT NULL
   )`,
];

type StoreGlobal = typeof globalThis & {
  __adunityDemoSalesPool?: Pool;
  __adunityDemoSalesSchema?: Promise<void>;
};

type SaleRow = {
  id: string;
  buyer_id: string;
  buyer: string;
  quantity: number;
  amount_bdt: string | number;
  created_at: string;
};

type BuyerRow = {
  buyer_name: string;
  quantity: number;
  fulfilled: number;
  budget_per_account_bdt: number;
  status: string;
};

export class DemoSaleStoreError extends Error {
  constructor(message: "buyer_not_available" | "quantity_unavailable" | "invalid_sale") {
    super(message);
    this.name = "DemoSaleStoreError";
  }
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("database_not_configured");
  const scope = globalThis as StoreGlobal;
  return (scope.__adunityDemoSalesPool ??= new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }));
}

async function ready(): Promise<Pool> {
  const pool = getPool();
  const scope = globalThis as StoreGlobal;
  if (!scope.__adunityDemoSalesSchema) {
    const setup = SCHEMA.reduce(
      (previous, statement) => previous.then(() => pool.query(statement).then(() => undefined)),
      Promise.resolve(),
    );
    scope.__adunityDemoSalesSchema = setup;
    void setup.catch(() => {
      if (scope.__adunityDemoSalesSchema === setup) scope.__adunityDemoSalesSchema = undefined;
    });
  }
  await scope.__adunityDemoSalesSchema;
  return pool;
}

function mapRow(row: SaleRow): DemoSaleRecord {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    buyer: row.buyer,
    quantity: row.quantity,
    amountBdt: Number(row.amount_bdt),
    createdAt: row.created_at,
  };
}

export async function listDemoSales(telegramId: number): Promise<DemoSaleRecord[]> {
  const pool = await ready();
  const result = await pool.query<SaleRow>(
    `SELECT id, buyer_id, buyer, quantity, amount_bdt, created_at
     FROM demo_sales WHERE telegram_id = $1
     ORDER BY created_at ASC, id ASC`,
    [telegramId],
  );
  return result.rows.map(mapRow);
}

/** Imports validated browser-era receipts once per account; retries are safe. */
export async function importLegacyDemoSales(
  telegramId: number,
  sales: readonly DemoSaleRecord[],
): Promise<void> {
  const pool = await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `INSERT INTO demo_sales_migrations (telegram_id, imported_at)
       VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING RETURNING telegram_id`,
      [telegramId, new Date().toISOString()],
    );
    if (claimed.rowCount === 1) {
      for (const sale of sales) {
        const duplicate = await client.query(
          "SELECT 1 FROM demo_sales WHERE telegram_id = $1 AND id = $2",
          [telegramId, sale.id],
        );
        if (duplicate.rowCount) continue;

        const buyerResult = await client.query<BuyerRow>(
          `SELECT buyer_name, quantity, fulfilled, budget_per_account_bdt, status
           FROM market_buyers WHERE id = $1 FOR UPDATE`,
          [sale.buyerId],
        );
        const buyer = buyerResult.rows[0];
        if (!buyer || buyer.buyer_name !== sale.buyer) continue;
        if (sale.amountBdt !== sale.quantity * buyer.budget_per_account_bdt) continue;

        const soldResult = await client.query<{ sold: string | number }>(
          `SELECT COALESCE(SUM(quantity), 0) AS sold
           FROM demo_sales WHERE telegram_id = $1 AND buyer_id = $2`,
          [telegramId, sale.buyerId],
        );
        const sold = Number(soldResult.rows[0]?.sold ?? 0);
        const remaining = Math.max(0, buyer.quantity - buyer.fulfilled - sold);
        if (sale.quantity > remaining) continue;

        await client.query(
          `INSERT INTO demo_sales (telegram_id, id, buyer_id, buyer, quantity, amount_bdt, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (telegram_id, id) DO NOTHING`,
          [telegramId, sale.id, sale.buyerId, buyer.buyer_name, sale.quantity, sale.amountBdt, sale.createdAt],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Saves a new sale from canonical listing values and enforces remaining quantity in Postgres. */
export async function createDemoSale(
  telegramId: number,
  input: { id: string; buyerId: string; quantity: number },
): Promise<DemoSaleRecord> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 25) {
    throw new DemoSaleStoreError("invalid_sale");
  }

  const pool = await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* A double-tapped save sends the same receipt id concurrently. Serialise that
       pair before the existence check so exactly one row is inserted. */
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${telegramId}:${input.id}`,
    ]);
    const duplicate = await client.query<SaleRow>(
      `SELECT id, buyer_id, buyer, quantity, amount_bdt, created_at
       FROM demo_sales WHERE telegram_id = $1 AND id = $2`,
      [telegramId, input.id],
    );
    if (duplicate.rows[0]) {
      await client.query("COMMIT");
      return mapRow(duplicate.rows[0]);
    }

    const buyerResult = await client.query<BuyerRow>(
      `SELECT buyer_name, quantity, fulfilled, budget_per_account_bdt, status
       FROM market_buyers WHERE id = $1 FOR UPDATE`,
      [input.buyerId],
    );
    const buyer = buyerResult.rows[0];
    if (!buyer || buyer.status !== "open") throw new DemoSaleStoreError("buyer_not_available");

    const soldResult = await client.query<{ sold: string | number }>(
      `SELECT COALESCE(SUM(quantity), 0) AS sold
       FROM demo_sales WHERE telegram_id = $1 AND buyer_id = $2`,
      [telegramId, input.buyerId],
    );
    const sold = Number(soldResult.rows[0]?.sold ?? 0);
    const remaining = Math.max(0, buyer.quantity - buyer.fulfilled - sold);
    if (input.quantity > remaining) throw new DemoSaleStoreError("quantity_unavailable");

    const amountBdt = input.quantity * buyer.budget_per_account_bdt;
    if (!Number.isSafeInteger(amountBdt)) throw new DemoSaleStoreError("invalid_sale");
    const createdAt = new Date().toISOString();
    const result = await client.query<SaleRow>(
      `INSERT INTO demo_sales (telegram_id, id, buyer_id, buyer, quantity, amount_bdt, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, buyer_id, buyer, quantity, amount_bdt, created_at`,
      [telegramId, input.id, input.buyerId, buyer.buyer_name, input.quantity, amountBdt, createdAt],
    );
    await client.query("COMMIT");
    return mapRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
