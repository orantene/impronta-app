import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * upgrade-flow-wiring.static.test.ts — the upgrade CTA reaches Stripe, and no
 * click handler can fake the tenant's tier.
 *
 * THE BUG CLASS
 * ─────────────
 * Two upgrade modals were mounted in the workspace admin.
 *
 *   • `site-control-center/global-upgrade-modal.tsx` — the real one:
 *     `startWorkspaceUpgrade` → Stripe Checkout. It was mounted only inside
 *     `shell/admin-shell.tsx`, a component NOTHING imports, so in the shipped
 *     product it never rendered.
 *   • `shell/internal/drawers/UpgradeModal.tsx` — the one users saw. Its CTA
 *     was `setPlan(requiredPlan)` — a `useState` setter — followed by a toast
 *     reading "upgrade applied". Nothing was written to `agencies.plan_tier`
 *     and nothing was charged. The shell re-rendered as though the tenant were
 *     on Agency: locked cards opened, roster caps moved, and every server-side
 *     gate kept refusing. One reload and it all vanished.
 *
 * The command palette carried the same defect independently: ⌘K → "Plan:
 * Agency" called the same setter.
 *
 * WHY A STATIC GUARD AND NOT ONLY A RENDER TEST
 * ─────────────────────────────────────────────
 * Both halves of the bug were invisible to unit tests because both were WIRING,
 * not logic: a mount that was never reached, and a setter exposed on a context
 * that any component could grab. Tests that exercise pure functions cannot see
 * either. So this asserts the wiring itself — the provider ancestry, the mount,
 * the server action on the far end, and the absence of a reachable plan setter.
 *
 * `test/components/admin/upgrade-modal-wiring.test.tsx` is the other half: it
 * renders the real chain and clicks the CTA.
 *
 * LANE
 * ────
 * `npm run test:billing`.
 */

const SRC_ROOT = resolve(process.cwd(), "src");
const src = (p: string) => resolve(SRC_ROOT, p);
const read = (p: string) => readFileSync(p, "utf8");

const SHELL_CONTEXT = src("components/admin/shell/internal/state/context.tsx");
const SHELL_CLIENT = src("components/admin/shell/admin-shell-client.tsx");
const UPGRADE_CONTEXT = src(
  "components/admin/site-control-center/upgrade-context.tsx",
);
const GLOBAL_MODAL = src(
  "components/admin/site-control-center/global-upgrade-modal.tsx",
);
const SHELL_MOUNT = src("components/admin/shell/internal/shell-upgrade-modal.tsx");
const SHELL_BOUNDARY = src("components/admin/shell/internal/shell-boundary.tsx");
const UPGRADE_BRIDGE = src(
  "components/admin/shell/internal/state/upgrade-bridge.ts",
);

/**
 * The ONLY files allowed to name a shell plan setter. `context.tsx` owns the
 * `useState`, `upgrade-bridge.ts` owns the gate, and `ControlBar.tsx` is the
 * prototype control bar, which that gate no-ops for any real bridged tenant.
 */
const PLAN_SETTER_OWNERS = new Set([
  "components/admin/shell/internal/state/context.tsx",
  "components/admin/shell/internal/state/upgrade-bridge.ts",
  "components/admin/shell/internal/page-modules/ControlBar.tsx",
]);

/**
 * Comments explain the ban; they do not violate it. Strip them before scanning
 * so a docblock that names `devSetPlan` is not read as a call site. `://` is
 * left alone so URLs survive.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("the fake upgrade modal is gone and cannot be re-exported", () => {
  assert.equal(
    existsSync(src("components/admin/shell/internal/drawers/UpgradeModal.tsx")),
    false,
    "drawers/UpgradeModal.tsx is back. Its CTA faked the tier with a useState " +
      "setter; the real modal is site-control-center/global-upgrade-modal.tsx.",
  );

  const barrel = read(src("components/admin/shell/internal/drawers.tsx"));
  assert.ok(
    !/UpgradeModal/.test(barrel),
    "the drawers barrel re-exports an UpgradeModal again — the shell must mount " +
      "ShellUpgradeModal (the real, Stripe-backed one) instead",
  );
});

test("no component can move the tenant's plan from a click handler", () => {
  const offenders: string[] = [];
  for (const file of walk(src("components"))) {
    const rel = relative(SRC_ROOT, file).replace(/\\/g, "/");
    if (PLAN_SETTER_OWNERS.has(rel)) continue;
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    const source = stripComments(read(file));
    // Component-local `const [plan, setPlan] = useState(...)` filters (the
    // platform Tenants/Users tables) are fine — they never touch a tenant row.
    // What must not exist is a plan setter pulled OFF the shell context.
    if (/\b(?:proto|shell|ctx)?\.?\bsetPlan\s*\(/.test(source) &&
        !/const\s*\[\s*plan\s*,\s*setPlan\s*\]/.test(source)) {
      offenders.push(rel);
    }
    if (/\bdevSetPlan\b/.test(source)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `these files reach a shell plan setter: ${offenders.join(", ")}. Changing a ` +
      `tenant's tier is a billing action — it goes through startWorkspaceUpgrade ` +
      `(Stripe Checkout) or changeWorkspacePlan, never a useState setter.`,
  );
});

test("the shell context exposes no plan setter, only the no-op dev override", () => {
  const source = read(SHELL_CONTEXT);

  // The public API surface must not carry `setPlan`. `devSetPlan` may.
  assert.ok(
    !/^\s*setPlan\s*:/m.test(source),
    "AdminShellApi exposes `setPlan` again — rename it back to `devSetPlan` and " +
      "keep it gated, or a click handler will fake the tier again",
  );
  assert.match(
    source,
    /devSetPlan\s*:\s*\(p:\s*Plan\)\s*=>\s*void/,
    "the dev-only plan override should stay declared as `devSetPlan` so this " +
      "guard and a reader can both tell it apart from a real tier change",
  );

  // The gate itself: a real bridged tenant gets a no-op.
  const bridge = read(UPGRADE_BRIDGE);
  assert.match(
    bridge,
    /export function devPlanOverrideAllowed\([\s\S]*?return !bridge\?\.tenantIdentity;/,
    "the override must key off the bridged tenant identity — that is the " +
      "canonical real-vs-demo signal",
  );
  assert.match(
    bridge,
    /if\s*\(!allowed\)\s*return;/,
    "useDevPlanOverride must bail for real tenants rather than setting state",
  );
  assert.match(
    source,
    /const devSetPlan = useDevPlanOverride\(initialBridgeData, setPlan\)/,
    "context.tsx must build devSetPlan through the gate, never expose setPlan raw",
  );
});

test("openUpgrade delegates to the real modal instead of local state", () => {
  const source = read(SHELL_CONTEXT);
  const bridge = read(UPGRADE_BRIDGE);

  assert.match(
    bridge,
    /import\s*\{\s*useUpgradeModal\s*\}\s*from\s*"@\/components\/admin\/site-control-center\/upgrade-context"/,
    "the bridge must delegate openUpgrade into UpgradeModalProvider",
  );
  assert.match(
    source,
    /const openUpgrade = useOpenUpgradeModal\(\)/,
    "the shell context's openUpgrade must come from the bridge",
  );
  assert.ok(
    !/useState<UpgradeOffer>/.test(stripComments(source)),
    "the shell is holding upgrade-modal state of its own again. One modal, one " +
      "owner (UpgradeModalProvider) — two was how the fake one stayed reachable.",
  );

  // The contextual framing has to survive the hop, or every prompt degrades
  // into a bare four-card plan picker.
  const call = bridge.slice(bridge.indexOf("openRealUpgradeModal({"));
  const body = call.slice(0, call.indexOf("});") + 3);
  for (const field of ["requiredPlan", "feature", "why"]) {
    assert.ok(
      body.includes(field),
      `openUpgrade drops \`${field}\` on the way to the modal, so it can no ` +
        `longer say which feature needs which plan`,
    );
  }
});

test("the live shell mounts the provider and the real modal", () => {
  const source = read(SHELL_CLIENT);
  const boundary = read(SHELL_BOUNDARY);

  assert.match(
    boundary,
    /import\s*\{\s*UpgradeModalProvider\s*\}/,
    "ShellBoundary must mount UpgradeModalProvider — useUpgradeModal no-ops " +
      "outside it, which silently kills every upgrade CTA",
  );
  assert.match(
    boundary,
    /<UpgradeModalProvider>\{children\}<\/UpgradeModalProvider>/,
    "ShellBoundary must render the provider around its children",
  );
  assert.match(source, /<ShellUpgradeModal\s*\/>/, "the real modal must be mounted");

  // Ancestry: the provider has to WRAP AdminShellProvider, because the shell
  // context calls useUpgradeModal(). Mounting it as a sibling or a descendant
  // compiles, renders, and does nothing. ShellBoundary is that ancestor, so
  // EVERY AdminShellProvider mount must be inside one.
  const shellMounts = (source.match(/<AdminShellProvider/g) ?? []).length;
  assert.ok(shellMounts > 0, "expected at least one AdminShellProvider mount");
  assert.equal(
    (source.match(/<ShellBoundary/g) ?? []).length,
    shellMounts,
    "every AdminShellProvider mount needs a ShellBoundary above it — that is " +
      "the only thing supplying UpgradeModalProvider",
  );
  for (const match of source.matchAll(/<ShellBoundary[\s\S]*?<\/ShellBoundary>/g)) {
    assert.match(
      match[0],
      /<AdminShellProvider/,
      "a ShellBoundary that does not wrap an AdminShellProvider is not the " +
        "ancestry this guard is asserting",
    );
  }
});

test("the modal's primary CTA reaches the Stripe server action", () => {
  const source = read(GLOBAL_MODAL);

  assert.match(
    source,
    /import\s*\{\s*startWorkspaceUpgrade\s*\}/,
    "the upgrade modal must call the Stripe checkout server action",
  );
  assert.match(
    source,
    /await\s+startWorkspaceUpgrade\(/,
    "handleSelect must actually invoke startWorkspaceUpgrade",
  );
  assert.match(
    source,
    /window\.location\.href\s*=\s*result\.redirectUrl/,
    "a successful checkout session must redirect the browser to Stripe",
  );

  // Network has no self-serve price. Its CTA must hand off to a human, never
  // toast and discard the intent the way the deleted modal did.
  assert.match(
    source,
    /result\.noStripe[\s\S]{0,400}mailto:/,
    "the Network branch must hand off to sales via mailto: — a toast that " +
      "records nothing throws away a customer's stated intent",
  );

  // The shell has no AdminWorkspaceProvider, so the mount supplies the slug.
  // Without it every checkout dies on "Couldn't identify workspace."
  assert.match(
    source,
    /const\s+slug\s*=\s*tenantSlug\s*\?\?\s*workspace\?\.slug/,
    "GlobalUpgradeModal must accept a tenantSlug override for the SPA shell",
  );

  const mount = read(SHELL_MOUNT);
  assert.match(
    mount,
    /<GlobalUpgradeModal\s+tenantSlug=\{tenantSlug\}\s+activePlan=\{state\.plan\}\s*\/>/,
    "ShellUpgradeModal must hand the real slug and the real tier to the modal",
  );
});

test("the upgrade context carries which feature needs which plan", () => {
  const source = read(UPGRADE_CONTEXT);
  assert.match(
    source,
    /export type UpgradeReason = \{[\s\S]*?requiredPlan\?[\s\S]*?feature\?[\s\S]*?why\?[\s\S]*?\}/,
    "UpgradeReason must carry requiredPlan + feature + why so the modal can say " +
      '"Custom domain needs Agency" rather than opening a generic plan picker',
  );

  const modal = read(src("components/admin/site-control-center/upgrade-modal.tsx"));
  assert.match(
    modal,
    /reason\?\.feature/,
    "the modal must render the feature that prompted the upgrade",
  );
  assert.match(
    modal,
    /upgradeReason\.needsPlan/,
    "the contextual line must come from the message catalog, not a literal",
  );
  assert.match(
    modal,
    /const isRequired = requiredPlan != null && plan\.key === requiredPlan/,
    "the required tier must be marked in the plan grid",
  );
});
