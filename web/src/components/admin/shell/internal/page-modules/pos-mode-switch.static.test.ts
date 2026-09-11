/**
 * The top-bar point of sale switch: where it is mounted, what gates it, and
 * what the chrome does once you are inside.
 *
 * WHY A STATIC TEST AND NOT A RENDER. `TulalaIdentityBar` and
 * `WorkspaceSidebarShell` both sit inside the whole shell provider tree —
 * mounting either one needs a bridge payload, a router and a locale context,
 * which is a fixture larger than the three facts being checked. The DECISIONS
 * themselves are already proved by behaviour elsewhere: `posSwitchModel` (in
 * `lib/workspace/pos-device-mode.test.ts`) decides whether the control exists,
 * and `destinations.test.ts` decides that the POS carries `chrome: "pos"` and
 * never appears as a rail row. What is left, and what this file covers, is the
 * WIRING between them — that the component is actually mounted, that it is
 * mounted in the top bar rather than the sidebar, and that the sidebar's
 * drop-out reads a server-seeded value rather than the live pathname.
 *
 * Lane: `npm run test:tenant-isolation`, next to
 * `mobile-bottom-nav.static.test.ts`, which does the same job for the phone's
 * half of this door.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DESTINATIONS } from "@/lib/workspace/destinations";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(WEB_ROOT, p), "utf8");

const SWITCH = "src/components/admin/shell/internal/page-modules/PosModeSwitch.tsx";
const IDENTITY_BAR = "src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx";
const SHELL = "src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx";
const SIDEBAR_SOURCE = "src/components/admin/shell/internal/page-modules/workspace-nav-groups.ts";

test("the switch is mounted in the identity bar, and nowhere else", () => {
  const bar = read(IDENTITY_BAR);
  assert.match(bar, /import \{ PosModeSwitch \}/, "the identity bar must import the switch");
  assert.match(bar, /<PosModeSwitch \/>/, "the identity bar must render the switch");
  // CENTRED: between the breadcrumb on the left and the action cluster on the
  // right (Create · bell · plan · account), never inside the trailing icon run.
  const breadcrumb = bar.indexOf("data-tulala-breadcrumb");
  const mount = bar.indexOf("<PosModeSwitch />");
  const actions = bar.indexOf("data-tulala-topbar-actions");
  assert.ok(breadcrumb > 0, "the workspace bar must carry the breadcrumb");
  assert.ok(mount > breadcrumb, "the switch must sit after the breadcrumb");
  assert.ok(
    actions > mount,
    "the switch must sit BEFORE the right-hand action cluster, in the centre",
  );
});

test("the switch renders nothing on its own — every gate comes from the tested model", () => {
  const src = read(SWITCH);
  assert.match(src, /posSwitchModel\(/, "visibility must come from the pure model");
  assert.match(
    src,
    /posEnabled:\s*workspacePosEnabled/,
    "the platform kill switch must be the bridge value",
  );
  assert.match(
    src,
    /workspaceEnabledModes:\s*workspacePosModes/,
    "the mode list must be the workspace's own, off the bridge",
  );
  // The defect this mirrors is the phone nav's, where BOTH halves of the gate
  // were literals and the row was unreachable behind a green suite.
  assert.ok(
    !/posEnabled:\s*(true|false)\b/.test(src),
    "the platform switch must never be a literal here",
  );
  assert.ok(
    !/workspaceEnabledModes:\s*\[\s*\]/.test(src),
    "an empty mode list can only ever resolve to no modes — pass the bridge value",
  );
  assert.match(src, /if \(!model\.visible\) return null;/, "an ungated person must see nothing");
});

test("the remembered mode is read in an effect, never during the first render", () => {
  const src = read(SWITCH);
  assert.match(
    src,
    /useState<PosMode \| null>\(null\)/,
    "the remembered mode must start null so the first paint does not depend on it",
  );
  // `src.indexOf("useEffect")` would land on the import line; the CALL site
  // is what matters.
  const firstEffectCall = src.indexOf("useEffect(");
  assert.ok(firstEffectCall > 0, "there must be an effect at all");
  assert.match(
    src.slice(firstEffectCall, firstEffectCall + 400),
    /readDevicePosMode\(/,
    "storage must be read inside the effect",
  );
  // The failure this forbids: a render-time storage read paints one label on
  // the server and another in the browser.
  assert.ok(
    !src.slice(0, firstEffectCall).includes("readDevicePosMode("),
    "storage must not be read before the first effect",
  );
});

test("the switch hides on narrow viewports — the phone has its own door", () => {
  const src = read(SWITCH);
  assert.match(src, /"relative hidden items-center md:inline-flex"/, "must be hidden below md");
  // And that other door still exists, gated by the same predicate.
  const mobile = read("src/lib/workspace/mobile-more-actions.ts");
  assert.match(mobile, /id: "open-pos"/, "the phone's More sheet must keep its Open POS row");
});

test("the point of sale is chrome, not a rail row", () => {
  // Read off the registry rather than off any component's source: this is the
  // fact the whole arrangement rests on.
  assert.equal(DESTINATIONS.pos.chrome, "pos");
  assert.equal(DESTINATIONS.pos.group, "pos");
  const sidebar = read(SIDEBAR_SOURCE);
  assert.ok(
    !/"pos"/.test(sidebar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")),
    "the sidebar builder must not name the point of sale in code",
  );
});

test("inside the point of sale the shell drops the sidebar, from server-seeded state", () => {
  const shell = read(SHELL);
  assert.match(
    shell,
    /const posChrome = resolveDestination\(state\.page\)\?\.chrome === "pos";/,
    "the drop-out must be decided from the registry and the shell's own page",
  );
  assert.match(shell, /if \(posChrome\) \{/, "there must be a chromeless branch");
  // Bounded by the branch's own end — the `return (` that follows it is the
  // WITH-sidebar layout, and letting the slice run into it would make the
  // "no sidebar" assertion below fail on the wrong element.
  const branchStart = shell.indexOf("if (posChrome) {");
  const branch = shell.slice(branchStart, shell.indexOf("\n  return (", branchStart));
  assert.ok(
    !branch.includes("data-tulala-app-sidebar"),
    "the point of sale branch must not render the sidebar",
  );
  assert.match(branch, /data-tulala-pos-chrome/, "the chromeless branch needs its own test hook");
  assert.match(branch, /grid-cols-\[1fr\]/, "the point of sale gets the full width");
  // usePathname is null during the shell's server render. Keying the layout on
  // it would paint the rail for one frame on every hard refresh of the
  // counter, and is the shape of the hydration failure that killed every
  // tenant page once already.
  //
  // Comments are stripped first: the branch above EXPLAINS why it does not
  // read the pathname, and a plain substring check would be satisfied by that
  // explanation — a guard failing on its own subject's prose measures the
  // wrong thing in both directions.
  const shellCode = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !shellCode.includes("usePathname"),
    "the shell must not read the live pathname to decide its own layout",
  );
});
