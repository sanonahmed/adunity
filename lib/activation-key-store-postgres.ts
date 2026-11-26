import { createHash, randomBytes, randomInt } from "node:crypto";
import { Pool } from "pg";
import {
  ACTIVATION_KEY_ALPHABET,
  ACTIVATION_KEY_GROUPS,
  ACTIVATION_KEY_GROUP_SIZE,
  ACTIVATION_KEY_PREFIX,
  activationKeyHint,
  formatActivationKey,
  isActivationKeyShaped,
  normalizeActivationKey,
  type ActivationKey,
  type IssuedActivationKey,
} from "./activation-keys";

/**
 * Postgres is the only place activation keys live. As with the referral and
 * market stores, the table is created on first use so a fresh Neon database
 * needs no manual migration step. Keys are stored as SHA-256 digests: the
 * plaintext key is returned once by `createActivationKey` and never persisted.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS activation_keys (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     key_hash TEXT NOT NULL UNIQUE,
     key_hint TEXT NOT NULL,
     created_at TEXT NOT NULL,
     revoked_at TEXT,
     last_used_at TEXT,
     use_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS activation_keys_created
     ON activation_keys (created_at DESC)`,
];

type ActivationGlobal = typeof globalThis & {
  __adunityActivationPool?: Pool;
  __adunityActivationSchema?: Promise<void>;
};

type ActivationRow = {
  id: string;
  label: string;
  key_hash: string;
  key_hint: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

const COLUMNS = "id, label, key_hash, key_hint, created_at, revoked_at, last_used_at, use_count";

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("database_not_configured");
  const scope = globalThis as ActivationGlobal;
  return (scope.__adunityActivationPool ??= new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }));
}

async function ensureSchema(pool: Pool): Promise<void> {
  const scope = globalThis as ActivationGlobal;
  if (!scope.__adunityActivationSchema) {
    const setup = (async () => {
      for (const statement of SCHEMA) await pool.query(statement);
    })();

    scope.__adunityActivationSchema = setup;
    void setup.catch(() => {
      if (scope.__adunityActivationSchema === setup) scope.__adunityActivationSchema = undefined;
    });
  }
  await scope.__adunityActivationSchema;
}

async function ready(): Promise<Pool> {
  const pool = getPool();
  await ensureSchema(pool);
  return pool;
}

/** Lowercase hex SHA-256 of an exact string; the value stored in `key_hash`. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Digest of the user-typed key, independent of case, dashes and spaces. */
export function activationKeyDigest(raw: string): string {
  return sha256Hex(normalizeActivationKey(raw));
}

function mapRow(row: ActivationRow): ActivationKey {
  return {
    id: row.id,
    label: row.label,
    hint: row.key_hint,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
  };
}

export async function listActivationKeys(): Promise<ActivationKey[]> {
  const pool = await ready();
  const result = await pool.query<ActivationRow>(
    `SELECT ${COLUMNS} FROM activation_keys ORDER BY created_at DESC LIMIT 200`,
  );
  return result.rows.map(mapRow);
}

/**
 * Issues a new key. The plaintext secret is returned once so the admin can copy
 * it; only its digest is written, which is why it can never be shown again.
 */
export async function createActivationKey(label: string): Promise<IssuedActivationKey> {
  const secret = newSecret();
  const digest = sha256Hex(secret);
  const pool = await ready();
  const result = await pool.query<ActivationRow>(
    `INSERT INTO activation_keys
       (id, label, key_hash, key_hint, created_at, revoked_at, last_used_at, use_count)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, 0)
     RETURNING ${COLUMNS}`,
    [newId(), label, digest, activationKeyHint(secret), new Date().toISOString()],
  );

  return {
    key: mapRow(result.rows[0]),
    secret: formatActivationKey(secret),
    digest,
  };
}

/** Revokes a key in place; rows are kept so the audit trail survives. */
export async function revokeActivationKey(id: string): Promise<ActivationKey | null> {
  const pool = await ready();
  const result = await pool.query<ActivationRow>(
    `UPDATE activation_keys SET revoked_at = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING ${COLUMNS}`,
    [id, new Date().toISOString()],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Verifies a submitted key against the stored digests. Returns the key row on
 * success and records the use; returns null for malformed, unknown or revoked
 * keys, so the caller cannot tell them apart.
 */
export async function verifyActivationKey(raw: string): Promise<ActivationKey | null> {
  const normalized = normalizeActivationKey(raw);
  if (!isActivationKeyShaped(normalized)) return null;

  const pool = await ready();
  const result = await pool.query<ActivationRow>(
    `UPDATE activation_keys
     SET last_used_at = $2, use_count = use_count + 1
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING ${COLUMNS}`,
    [activationKeyDigest(normalized), new Date().toISOString()],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

function newId(): string {
  return `act_${randomBytes(9).toString("base64url")}`;
}

/** Normalized (unformatted) plaintext key: prefix plus 20 unambiguous characters. */
function newSecret(): string {
  let body = "";
  for (let index = 0; index < ACTIVATION_KEY_GROUPS * ACTIVATION_KEY_GROUP_SIZE; index += 1) {
    body += ACTIVATION_KEY_ALPHABET[randomInt(ACTIVATION_KEY_ALPHABET.length)];
  }
  return `${ACTIVATION_KEY_PREFIX}${body}`;
}
