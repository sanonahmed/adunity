/**
 * Auto Bot activation keys, shared by the admin panel, the admin API and the
 * activation endpoint.
 *
 * A key is a short, human-typable code such as `ADU-8F2K-QW7M-3XPR-9TLD-6HZN`.
 * Only its SHA-256 digest is stored, so the plaintext exists exactly once: in
 * the response that created it. Buyers paste the key into the Auto Bot panel
 * and the server verifies the digest without ever storing the key itself.
 *
 * This module holds no crypto and no database access so the admin UI can import
 * it directly; generation and hashing live in `activation-key-store-postgres.ts`.
 */

export const ACTIVATION_KEY_PREFIX = "ADU";

/** Crockford-style alphabet: no 0/O/1/I/L, so a typed key is never ambiguous. */
export const ACTIVATION_KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const ACTIVATION_KEY_GROUP_SIZE = 4;
export const ACTIVATION_KEY_GROUPS = 5;
/** Characters after the prefix, e.g. 20 -> five groups of four. */
export const ACTIVATION_KEY_LENGTH = ACTIVATION_KEY_GROUP_SIZE * ACTIVATION_KEY_GROUPS;

export const ACTIVATION_KEY_LIMITS = {
  label: 60,
  /** Anything longer than this is rejected before hashing. */
  raw: 128,
} as const;

export const DEFAULT_ACTIVATION_KEY_LABEL = "Auto Bot key";

export type ActivationKey = {
  id: string;
  label: string;
  /** Recognisable fragment of the key, e.g. "ADU-8F2K…6HZN". Never the full key. */
  hint: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp; null while the key is still accepted. */
  revokedAt: string | null;
  /** ISO timestamp of the last successful activation, or null. */
  lastUsedAt: string | null;
  useCount: number;
};

export type ActivationKeyErrors = { label?: string };

export type ActivationKeyParseResult =
  | { ok: true; value: { label: string } }
  | { ok: false; errors: ActivationKeyErrors };

/** A freshly issued key plus the material the admin needs to copy once. */
export type IssuedActivationKey = {
  key: ActivationKey;
  /** Full plaintext key, shown once and never stored. */
  secret: string;
  /** `AUTOBOT_ACTIVATION_KEY_SHA256` value, for env-only deployments. */
  digest: string;
};

/** Uppercase and drop separators, so case and dashes never matter on input. */
export function normalizeActivationKey(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** "ADU8F2KQW7M3XPR9TLD6HZN" -> "ADU-8F2K-QW7M-3XPR-9TLD-6HZN" */
export function formatActivationKey(normalized: string): string {
  const prefix = normalized.slice(0, ACTIVATION_KEY_PREFIX.length);
  const body = normalized.slice(ACTIVATION_KEY_PREFIX.length);
  const groups: string[] = [];
  for (let index = 0; index < body.length; index += ACTIVATION_KEY_GROUP_SIZE) {
    groups.push(body.slice(index, index + ACTIVATION_KEY_GROUP_SIZE));
  }
  return [prefix, ...groups].join("-");
}

/** Masked label for lists: "ADU-8F2K…6HZN". */
export function activationKeyHint(normalized: string): string {
  const body = normalized.slice(ACTIVATION_KEY_PREFIX.length);
  if (body.length < 8) return formatActivationKey(normalized);
  return `${ACTIVATION_KEY_PREFIX}-${body.slice(0, 4)}…${body.slice(-4)}`;
}

/** Cheap shape test, run before hashing an untrusted key. */
export function isActivationKeyShaped(normalized: string): boolean {
  if (!normalized.startsWith(ACTIVATION_KEY_PREFIX)) return false;
  if (normalized.length !== ACTIVATION_KEY_PREFIX.length + ACTIVATION_KEY_LENGTH) return false;
  return [...normalized].every((character) => ACTIVATION_KEY_ALPHABET.includes(character));
}

export function isActivationKeyActive(key: ActivationKey): boolean {
  return key.revokedAt === null;
}

export function formatActivationKeyUse(key: ActivationKey): string {
  if (key.useCount === 0) return "Never used";
  return `Used ${key.useCount} ${key.useCount === 1 ? "time" : "times"}`;
}

/**
 * Validates the generate form. The label is optional and only ever used for
 * display in the admin panel, so an empty one falls back to a fixed default.
 */
export function parseActivationKeyInput(body: unknown): ActivationKeyParseResult {
  const errors: ActivationKeyErrors = {};
  const source = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const rawLabel =
    typeof source.label === "string"
      ? source.label
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

  if (rawLabel.length > ACTIVATION_KEY_LIMITS.label) {
    errors.label = `Keep the label under ${ACTIVATION_KEY_LIMITS.label} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { label: rawLabel || DEFAULT_ACTIVATION_KEY_LABEL } };
}
