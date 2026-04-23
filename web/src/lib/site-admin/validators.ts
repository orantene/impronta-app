import { z } from "zod";

/**
 * Postgres-compatible UUID. Accepts any 8-4-4-4-12 hex string — matches
 * what Postgres' native `uuid` type stores, without requiring the RFC 9562
 * version/variant bits that Zod's `z.string().uuid()` enforces.
 *
 * Use this for any id coming from or going to the database. Demo/seed
 * UUIDs like `33333333-3333-3333-3333-333333333333` fail strict RFC 9562
 * but are valid Postgres UUIDs, and rejecting them breaks tenant-scoped
 * writes on demo agencies.
 */
const PG_UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const pgUuidSchema = () =>
  z.string().regex(PG_UUID_RE, { message: "Invalid UUID" });
