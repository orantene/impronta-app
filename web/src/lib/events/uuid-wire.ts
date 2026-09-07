import { z } from "zod";

/**
 * Wire-shape UUID for public event actions.
 *
 * Zod's `.uuid()` rejects the seeded Impronta tenant
 * `00000000-0000-0000-0000-000000000001` (version nibble 0). The ticket-picker
 * island accepts that id with a hex regex; the server must match or every
 * Impronta event returns `unavailable` while looking configured.
 */
export const uuidWire = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
