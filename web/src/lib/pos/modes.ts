/**
 * The point of sale's mode vocabulary — pure data + pure functions, no
 * runtime imports. Nothing here touches Supabase, `server-only`, React, or
 * any other module: it has to be safe to import from a client component, a
 * server component, or a plain unit test with zero setup.
 *
 * WHAT A "MODE" IS. The POS is entered from a switch in the top bar (never
 * the sidebar — that's owned by another task). Once inside, a mode is one
 * screen family: selling at a register, running the floor, checking guests
 * in at a door, tracking a class roster, or running a project board. Which
 * modes a person sees is the intersection of two things: which modes the
 * workspace itself has turned on, and which modes that person's role is
 * allowed to reach.
 *
 * WHY "LOCATION" MEANS "WORKSPACE" FOR NOW. There is no locations table yet.
 * `enabledPosModesFromSettings` reads the workspace's per-workspace settings
 * blob (`agencies.settings`, the same JSONB column every other workspace
 * setting already lives in — see `admin-workspace-settings.ts`) at the path
 * `pos.locations.default.modes`. The literal key `"default"` stands in for
 * the workspace's one implicit location. When a real locations table exists,
 * each row gets its own key under `pos.locations.<id>.modes` and this reader
 * changes to take a location id — the shape does not have to change, and
 * nothing that already reads `"default"` breaks.
 *
 * WHY "CASHIER", "HOST" AND "PROFESSIONAL" ARE NOT ROLES HERE. The tenant
 * role ladder (`lib/access/roles.ts`) has exactly five stored ranks: viewer,
 * editor, manager, admin, owner. There is no `cashier`, `host`, or
 * `professional` column anywhere in this codebase today — the product
 * language describes floor staff by job function, the database only knows
 * rank. Rather than invent a column this module derives them from the
 * ladder: `editor` is the rank between read-only `viewer` and business-owning
 * `manager`, so it is treated as the frontline-staff rank and stands in for
 * cashier, host, and professional all at once (the ladder cannot tell those
 * three job functions apart, so this module does not pretend it can).
 * `manager` and everything above it additionally unlocks `projects`, which is
 * a business-management surface, not a floor position. This keeps the
 * existing "every higher role is a strict superset of the lower" invariant
 * from `roles.ts` intact instead of fighting it.
 */

export const POS_MODES = ["counter", "floor", "door", "classes", "projects"] as const;

export type PosMode = (typeof POS_MODES)[number];

/**
 * Mirrors `TenantRoleKey` from `lib/access/roles.ts` by value, deliberately
 * NOT imported — this module has zero runtime imports by design (see file
 * header). If the role ladder ever adds or renames a rank, that file's own
 * tests will not catch this copy drifting; whoever touches the ladder next
 * needs to know this literal union exists.
 */
export type PosPersonRole = "viewer" | "editor" | "manager" | "admin" | "owner";

const ROLE_RANK: Record<PosPersonRole, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

export type PosModeMeta = {
  readonly id: PosMode;
  /** English label. No other locale exists for this yet. */
  readonly label: string;
  /** Destination ids this mode's own rail offers once it has a screen. */
  readonly destinations: readonly string[];
  /** Whether this mode has a real screen behind it yet. */
  readonly built: boolean;
};

export const POS_MODE_META: Record<PosMode, PosModeMeta> = {
  counter: {
    id: "counter",
    label: "Counter",
    destinations: ["sell", "orders", "shifts"],
    built: true,
  },
  floor: {
    id: "floor",
    label: "Tables",
    destinations: ["tables", "seating"],
    built: true,
  },
  door: {
    id: "door",
    label: "Door",
    destinations: ["checkin", "tickets"],
    built: true,
  },
  classes: {
    id: "classes",
    label: "Classes",
    destinations: ["roster", "attendance"],
    built: false,
  },
  projects: {
    id: "projects",
    label: "Projects",
    // The design's rail is Due · Projects · Links · Receipts · Issues
    // (`docs/plans/program/pos/modes.md`). `collect` IS Due (the landing
    // action is "Collect a balance", D-POS-10); Links has no table yet and
    // Issues is the workspace's own inbox, so neither is a row here.
    destinations: ["collect", "projects", "receipts"],
    built: false,
  },
};

function isPosMode(value: unknown): value is PosMode {
  return typeof value === "string" && (POS_MODES as readonly string[]).includes(value);
}

/**
 * The modes a role is eligible for, before intersecting with what the
 * workspace has actually enabled. `viewer` (an "assistant" in product
 * language — read-only access, see `roles.ts`) gets none: the POS moves
 * money and inventory, and a read-only rank has no business in it.
 */
function eligibleModesForRole(role: PosPersonRole): readonly PosMode[] {
  const rank = ROLE_RANK[role];
  if (rank < ROLE_RANK.editor) return [];
  const eligible: PosMode[] = ["counter", "floor", "door", "classes"];
  if (rank >= ROLE_RANK.manager) eligible.push("projects");
  return eligible;
}

/**
 * The modes a given person may actually use: their role's eligible modes,
 * narrowed to whatever the workspace itself has switched on. Order follows
 * `POS_MODES`, not the input order, so callers get a stable rail.
 */
export function modesForPerson(input: {
  role: PosPersonRole;
  workspaceEnabledModes: readonly PosMode[];
}): PosMode[] {
  const eligible = eligibleModesForRole(input.role);
  return POS_MODES.filter(
    (mode) => eligible.includes(mode) && input.workspaceEnabledModes.includes(mode),
  );
}

/**
 * Parses an untrusted query-string value (a Next.js `searchParams` entry:
 * could be a string, an array from a repeated key, `undefined`, or anything
 * else a hand-built URL throws at it) into a known mode, or `undefined` for
 * anything that isn't exactly one of the five ids.
 */
export function parsePosMode(value: unknown): PosMode | undefined {
  return isPosMode(value) ? value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** counter-only — the safe default when a workspace has no `pos` settings at all. */
const DEFAULT_ENABLED_MODES: readonly PosMode[] = ["counter"];

/**
 * Reads which modes a workspace has enabled out of its settings blob
 * (`agencies.settings`, already-fetched — this function does no I/O of its
 * own, it only walks a plain object). Looks at `pos.locations.default.modes`
 * so that a real locations table can later key this by location id without a
 * shape change: `"default"` is the one implicit location every workspace has
 * today.
 *
 * THREE INPUTS, THREE DIFFERENT ANSWERS — and the middle one used to be
 * wrong. A workspace that has never opened the settings page has NO `pos`
 * path at all, and its POS must still work, so a missing or malformed path
 * answers `["counter"]`. A workspace that has switched every mode off stores
 * a literal empty array, and that is a REAL value: it answers `[]`, and the
 * point of sale is then unavailable to that workspace (`showsOpenPosRow`
 * drops the phone row, `sellingModesAllowCounter` refuses the counter route).
 * Coercing `[]` back to `["counter"]` is what made the settings panel unable
 * to persist anything: the only built mode is the counter, so the only
 * reachable write was the empty list, and this line turned it straight back
 * into the default. `pos-bridge.ts` has documented `[]` as "deliberately off"
 * since the mobile-nav fix; this function now agrees with it.
 *
 * An array with entries in it, none of which parse, is MALFORMED rather than
 * deliberate — some other writer put junk there — so that answers the default
 * too. One bad value alongside a good one is still dropped on its own.
 */
export function enabledPosModesFromSettings(settings: unknown): PosMode[] {
  const pos = isPlainRecord(settings) ? settings.pos : undefined;
  const locations = isPlainRecord(pos) ? pos.locations : undefined;
  const defaultLocation = isPlainRecord(locations) ? locations.default : undefined;
  const rawModes = isPlainRecord(defaultLocation) ? defaultLocation.modes : undefined;
  if (!Array.isArray(rawModes)) return [...DEFAULT_ENABLED_MODES];
  if (rawModes.length === 0) return [];
  const parsed = rawModes.filter(isPosMode);
  return parsed.length > 0 ? parsed : [...DEFAULT_ENABLED_MODES];
}

/**
 * Is the counter — the one mode with screens behind it — switched on for this
 * workspace. The `/admin/pos` route IS the counter (its rail is
 * `POS_MODE_META.counter.destinations`), so this is the one question that
 * route has to ask before it renders a register.
 */
export function sellingModesAllowCounter(modes: readonly PosMode[]): boolean {
  return modes.includes("counter");
}
