import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPTION_LABELS_EN,
  OPTION_TARGETS,
  normalizeLabel,
  parseOptionArgs,
  planOptionLabels,
  runOptionLabels,
  type ChildRow,
  type ChildRows,
  type ChildTable,
  type OptionLabelIo,
} from "./option-labels";
import type { ProfileRow } from "./plan";

const ALEX = "TAL-93030";
const PROFILE_ID = "p-alex";

const variant = (id: string, label: string, label_i18n: unknown = null): ChildRow => ({ id, offering_id: "o1", label, label_i18n });

interface Db {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  children: Record<string, ChildRows>;
}

interface Calls {
  updates: Array<{ table: ChildTable; profileId: string; id: string; label_i18n: Record<string, string> }>;
  backups: Array<{ label: string; data: unknown }>;
}

function baseDb(overrides: Partial<Db> = {}): Db {
  return {
    profiles: { [ALEX]: { id: PROFILE_ID, profile_code: ALEX, is_demo: true } },
    slugs: { [PROFILE_ID]: "alex-trevino" },
    children: {
      [PROFILE_ID]: {
        variants: [variant("v1", "Casa", { es: "Casa" }), variant("v2", "Departamento"), variant("v3", "Local comercial", { es: "Local comercial" })],
        addons: [],
      },
    },
    ...overrides,
  };
}

function fakeIo(db: Db, opts: { failWrite?: boolean } = {}): { io: OptionLabelIo; calls: Calls } {
  const calls: Calls = { updates: [], backups: [] };
  const io: OptionLabelIo = {
    async findProfile(code) {
      return db.profiles[code] ?? null;
    },
    async findSiteSlug(profileId) {
      return db.slugs[profileId] ?? null;
    },
    async listChildren(profileId) {
      const c = db.children[profileId] ?? { variants: [], addons: [] };
      return { variants: c.variants.map((r) => ({ ...r })), addons: c.addons.map((r) => ({ ...r })) };
    },
    async updateChildLabel({ table, profileId, id, label_i18n }) {
      calls.updates.push({ table, profileId, id, label_i18n });
      if (opts.failWrite) return { ok: false, error: "boom" };
      const c = db.children[profileId]!;
      const list = table === "talent_offering_variants" ? c.variants : c.addons;
      const row = list.find((r) => r.id === id);
      if (!row) return { ok: false, error: "row not updated (no match)" };
      row.label_i18n = label_i18n;
      return { ok: true };
    },
    writeBackup(label, data) {
      calls.backups.push({ label, data });
      return `/tmp/${label}.json`;
    },
  };
  return { io, calls };
}

const run = async (argv: string[], db: Db, opts: { failWrite?: boolean } = {}) => {
  const { io, calls } = fakeIo(db, opts);
  const lines: string[] = [];
  const result = await runOptionLabels(argv, io, (l) => lines.push(l));
  return { result, calls, lines };
};

test("the allow-list is Alex only and never a real or QA talent", () => {
  assert.deepEqual(OPTION_TARGETS.map((t) => t.profileCode), [ALEX]);
  assert.ok(!OPTION_TARGETS.some((t) => t.profileCode === "TAL-93938" || t.profileCode === "TAL-93900"));
});

test("normalizeLabel folds case, accents and spaces", () => {
  assert.equal(normalizeLabel("  LOCAL   Comercial "), "local comercial");
  assert.equal(OPTION_LABELS_EN[normalizeLabel("Departamento")], "Apartment");
});

test("plan: Casa, Departamento and Local comercial get an English label; es and the plain label stay", () => {
  const c = baseDb().children[PROFILE_ID]!;
  const plan = planOptionLabels(PROFILE_ID, c);
  assert.deepEqual(plan.patches.map((p) => [p.id, p.next.en]), [["v1", "House"], ["v2", "Apartment"], ["v3", "Commercial space"]]);
  assert.deepEqual(plan.patches[0]!.next, { es: "Casa", en: "House" });
  assert.deepEqual(plan.patches[1]!.next, { en: "Apartment" }, "a label with no es key gets en only; es is not invented");
  assert.equal(plan.skipped.length, 0);
});

test("plan: a non-empty English label is never overwritten", () => {
  const plan = planOptionLabels(PROFILE_ID, { variants: [variant("v1", "Casa", { es: "Casa", en: "Home" })], addons: [] });
  assert.equal(plan.patches.length, 0);
  assert.match(plan.skipped[0]!.reason, /English already set/);
});

test("plan: an unknown label is skipped and listed, never guessed", () => {
  const plan = planOptionLabels(PROFILE_ID, { variants: [variant("v1", "Tablero trifásico")], addons: [] });
  assert.equal(plan.patches.length, 0);
  assert.match(plan.skipped[0]!.reason, /no known English for "Tablero trifásico"/);
});

test("plan: a label_i18n that is not a plain text map is skipped", () => {
  const plan = planOptionLabels(PROFILE_ID, { variants: [variant("v1", "Casa", ["not", "a", "map"])], addons: [] });
  assert.equal(plan.patches.length, 0);
  assert.match(plan.skipped[0]!.reason, /not a plain text map/);
});

test("plan: add-ons are covered too", () => {
  const plan = planOptionLabels(PROFILE_ID, { variants: [], addons: [{ id: "a1", offering_id: "o1", label: "Casa", label_i18n: null }] });
  assert.deepEqual(plan.patches.map((p) => [p.table, p.next.en]), [["talent_offering_addons", "House"]]);
});

test("args: unknown flags, --apply without --yes and --yes without --apply are refused", () => {
  assert.throws(() => parseOptionArgs(["--option-labels", "--wat"]), /unknown argument/);
  assert.throws(() => parseOptionArgs(["--option-labels", "--apply"]), /--apply needs --yes/);
  assert.throws(() => parseOptionArgs(["--option-labels", "--yes"]), /--yes without --apply/);
  assert.throws(() => parseOptionArgs(["--apply", "--yes"]), /--option-labels is required/);
  assert.deepEqual(parseOptionArgs(["--option-labels"]), { apply: false, yes: false });
});

test("dry run prints the plan and writes nothing", async () => {
  const db = baseDb();
  const { result, calls, lines } = await run(["--option-labels"], db);
  assert.equal(result.exitCode, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.backups.length, 0);
  assert.ok(lines.some((l) => l.includes("DRY RUN")));
  assert.ok(lines.some((l) => l.includes("TOTALS: 3 label(s) to set")));
});

test("apply writes only label_i18n.en, keeps the plain label, backs up first and verifies", async () => {
  const db = baseDb();
  const { result, calls, lines } = await run(["--option-labels", "--apply", "--yes"], db);
  assert.equal(result.exitCode, 0);
  assert.equal(result.wrote, 3);
  assert.equal(calls.backups.length, 1);
  assert.equal(calls.updates.length, 3);
  assert.ok(calls.updates.every((u) => u.profileId === PROFILE_ID && u.table === "talent_offering_variants"));
  const rows = db.children[PROFILE_ID]!.variants;
  assert.deepEqual(rows.map((r) => r.label), ["Casa", "Departamento", "Local comercial"]);
  assert.deepEqual(rows.map((r) => (r.label_i18n as Record<string, string>).en), ["House", "Apartment", "Commercial space"]);
  assert.ok(lines.some((l) => l.startsWith("Applied and verified: 3")));
});

test("a second run has nothing left to write", async () => {
  const db = baseDb();
  await run(["--option-labels", "--apply", "--yes"], db);
  const again = await run(["--option-labels", "--apply", "--yes"], db);
  assert.equal(again.result.exitCode, 0);
  assert.equal(again.result.wrote, 0);
  assert.equal(again.calls.updates.length, 0);
});

test("a failed write is reported and exits 1, with the backup path", async () => {
  const { result, lines } = await run(["--option-labels", "--apply", "--yes"], baseDb(), { failWrite: true });
  assert.equal(result.exitCode, 1);
  assert.ok(lines.some((l) => l.includes("VERIFY FAILED")));
  assert.ok(lines.some((l) => l.includes("Restore from the backup")));
});

test("a profile that is not flagged is_demo is refused before any write", async () => {
  const db = baseDb({ profiles: { [ALEX]: { id: PROFILE_ID, profile_code: ALEX, is_demo: false } } });
  const { result, calls, lines } = await run(["--option-labels", "--apply", "--yes"], db);
  assert.equal(result.exitCode, 3);
  assert.equal(calls.updates.length, 0);
  assert.ok(lines.some((l) => l.includes("not flagged is_demo")));
});

test("a wrong site slug is refused before any write", async () => {
  const db = baseDb({ slugs: { [PROFILE_ID]: "somebody-else" } });
  const { result, calls } = await run(["--option-labels", "--apply", "--yes"], db);
  assert.equal(result.exitCode, 3);
  assert.equal(calls.updates.length, 0);
});

test("a profile missing from this database is skipped, not an error", async () => {
  const { result, calls, lines } = await run(["--option-labels", "--apply", "--yes"], baseDb({ profiles: {} }));
  assert.equal(result.exitCode, 0);
  assert.equal(calls.updates.length, 0);
  assert.ok(lines.some((l) => l.includes("not found in this database")));
});
