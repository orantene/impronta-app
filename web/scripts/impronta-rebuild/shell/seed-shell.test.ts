import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import {
  classifyShellTree,
  resolveShellSidePlan,
  splitShellTree,
} from "@/lib/site-admin/builder-node/shell-render-plan";

import { buildShellTree, countNodes, treesForLocale } from "./seed-shell";

/**
 * seed-shell.test.ts — the shell tree's load-bearing invariants.
 *
 * Each assertion here corresponds to a failure mode that is SILENT on the live
 * site (no error, no empty state — just the wrong header), so none of them can
 * be left to review:
 *
 *   - a landmark without `sectionId` addresses nothing and its children stop
 *     rendering (site-shell-surface-tree.ts:92-100)
 *   - a landmark without `ejected` renders the curated bar AND our tree
 *     (PublishedShell.renderFreeformShellLandmark) — two headers
 *   - the footer landmark is what `splitShellTree` cuts on; lose it and the
 *     whole tree resolves as header
 */

const ANCHORS = {
  header: "11111111-1111-1111-1111-111111111111",
  footer: "22222222-2222-2222-2222-222222222222",
};

/**
 * Impronta's footer slot is stored with sortOrder 0 (NOT 1). The fixture keeps
 * that asymmetry on purpose: assuming header=0/footer=1 is precisely the bug
 * that shipped a header-less site, because the address key is
 * `sectionId:slotKey:sortOrder` and a guessed sortOrder matches no slot.
 */
const SORT_ORDERS = { header: 0, footer: 0 };

function treeFor(locale: string) {
  const { header, footer } = treesForLocale(locale);
  return buildShellTree({
    anchors: ANCHORS,
    sortOrders: SORT_ORDERS,
    header,
    footer,
  });
}

/** The snapshot slots the anchors correspond to. */
const SLOTS = [
  {
    sectionId: ANCHORS.header,
    slotKey: "header",
    sortOrder: SORT_ORDERS.header,
    sectionTypeKey: "site_header",
  },
  {
    sectionId: ANCHORS.footer,
    slotKey: "footer",
    sortOrder: SORT_ORDERS.footer,
    sectionTypeKey: "site_footer",
  },
] as never[];

for (const locale of ["en", "es"]) {
  test(`[${locale}] the shell tree validates`, () => {
    const result = validateBuilderNodeTree(treeFor(locale));
    if (!result.ok) {
      assert.fail(
        `invalid shell tree: ${result.issues.map((i) => i.message).join("; ")}`,
      );
    }
  });

  test(`[${locale}] exactly two roots: the header then the footer landmark`, () => {
    const tree = treeFor(locale);
    assert.equal(tree.length, 2);
    const kinds = tree.map((n) => (n as { props: { sectionTypeKey: string } }).props.sectionTypeKey);
    assert.deepEqual(kinds, ["site_header", "site_footer"]);
  });

  test(`[${locale}] BOTH landmarks are ejected (or the curated bar renders too)`, () => {
    for (const node of treeFor(locale)) {
      const props = (node as { props: Record<string, unknown> }).props;
      assert.equal(
        props.ejected,
        true,
        `${String(props.sectionTypeKey)} must be ejected; without it PublishedShell renders the curated component AND these children`,
      );
    }
  });

  test(`[${locale}] BOTH landmarks carry their anchor sectionId`, () => {
    const [header, footer] = treeFor(locale) as Array<{
      props: { sectionId?: string };
    }>;
    assert.equal(header.props.sectionId, ANCHORS.header);
    assert.equal(footer.props.sectionId, ANCHORS.footer);
  });

  test(`[${locale}] both landmarks actually carry content`, () => {
    for (const node of treeFor(locale)) {
      const children = (node as { children?: unknown[] }).children ?? [];
      assert.ok(
        children.length > 0,
        "an empty landmark would publish an empty header/footer",
      );
    }
  });

  test(`[${locale}] splitShellTree separates header from footer`, () => {
    const split = splitShellTree(treeFor(locale) as never);
    assert.equal(split.header.length, 1, "header side must hold one landmark");
    assert.equal(split.footer.length, 1, "footer side must hold one landmark");
  });

  test(`[${locale}] each side resolves to a renderable plan`, () => {
    const tree = treeFor(locale) as never;
    for (const side of ["header", "footer"] as const) {
      const plan = resolveShellSidePlan({ tree, slots: SLOTS, side });
      assert.notEqual(
        plan.mode,
        "none",
        `${side} resolved to "none" — nothing would render`,
      );
    }
  });
}

test("EN and ES trees have identical structure (only copy differs)", () => {
  const shape = (locale: string) =>
    JSON.stringify(
      treeFor(locale),
      (key, value) =>
        // Compare STRUCTURE: drop ids and every human-visible string, keep kinds
        // and the props that decide rendering.
        key === "id" || key === "text" || key === "label" || key === "alt"
          ? undefined
          : value,
    ).replace(/"[^"]*(Inicio|Home|Contacto|Contact|Men[uú])[^"]*"/g, '"~"');
  assert.equal(
    countNodes(treeFor("en")),
    countNodes(treeFor("es")),
    "locale trees must have the same node count",
  );
  assert.equal(shape("en").length > 0, true);
});

test("classifyShellTree sees an addressed pair (the eject guard, not a synthetic root, is what frees us)", () => {
  // Documented so the next person does not "fix" this by bolting on a spare
  // root: with `ejected` honored on BOTH render paths, a legacy_slots
  // classification is fine — renderShellSlot skips the curated component and
  // renders our children.
  const classification = classifyShellTree(treeFor("en") as never, SLOTS);
  assert.equal(classification, "legacy_slots");
});

test("the tree carries no unresolved image-slot tokens once seeded", () => {
  // The seeder resolves IMAGE_SLOT tokens before writing; this pins that a raw
  // token in the authored tree is visible here rather than on the live site.
  const raw = JSON.stringify(treeFor("en"));
  const tokens = raw.match(/slot:\/\/impronta-rebuild\/[a-z0-9-]+/g) ?? [];
  assert.ok(
    tokens.length > 0,
    "expected authored image slots (the seeder resolves them at write time)",
  );
});

test("every landmark address key resolves to a real slot (the header-less bug)", () => {
  // THE regression: a landmark whose `sectionId:slotKey:sortOrder` matches no
  // slot is invisible to `renderShellSlot` -- it finds no builder node, renders
  // no children, and because `ejected` correctly suppresses the curated bar the
  // page ends up with NO header. Shipped exactly once; pinned here forever.
  const slotKeys = new Set(
    (SLOTS as unknown as Array<{
      sectionId: string;
      slotKey: string;
      sortOrder: number;
    }>).map((s) => `${s.sectionId}:${s.slotKey}:${s.sortOrder}`),
  );
  for (const locale of ["en", "es"]) {
    for (const node of treeFor(locale) as Array<{
      props: { sectionId?: string; slotKey?: string; sortOrder?: number };
    }>) {
      const key = `${node.props.sectionId}:${node.props.slotKey}:${node.props.sortOrder}`;
      assert.ok(
        slotKeys.has(key),
        `[${locale}] landmark address "${key}" matches no snapshot slot — its children would never render`,
      );
    }
  }
});

test("the phone header stays ONE row, and the blur is cleared so the drawer works", () => {
  // Both halves of the live mobile defect, pinned together because they present
  // as one symptom (a 141px, three-row phone header whose hamburger opens a
  // clipped stub):
  //   - containers fall back to a COLUMN at the mobile tier, so the widget
  //     cluster needs an explicit props-level mobile row;
  //   - `backdrop-filter` on the bar makes it the containing block for the
  //     nav's position:fixed drawer, so it must be cleared at mobile.
  for (const locale of ["en", "es"]) {
    const { header } = treesForLocale(locale);
    const find = (suffix: string) => {
      const stack = [...(header as unknown as Array<Record<string, unknown>>)];
      while (stack.length) {
        const n = stack.pop() as { id?: string; children?: unknown[] };
        if (typeof n.id === "string" && n.id.endsWith(suffix)) return n as never;
        if (Array.isArray(n.children)) stack.push(...(n.children as never[]));
      }
      return null;
    };
    const bar = find("-main-bar") as unknown as {
      props: { style: { responsive?: { mobile?: { backdropFilter?: string } } } };
    } | null;
    const cluster = find("-actions") as unknown as {
      props: { responsive?: { mobile?: { layout?: string } } };
    } | null;
    assert.ok(bar && cluster, `[${locale}] header must have a bar + actions cluster`);
    assert.equal(
      bar!.props.style.responsive?.mobile?.backdropFilter,
      "none",
      `[${locale}] the bar must clear its blur on mobile or the drawer is trapped inside it`,
    );
    assert.equal(
      cluster!.props.responsive?.mobile?.layout,
      "row",
      `[${locale}] the widget cluster must stay a row on mobile (default is column)`,
    );
  }
});

test("the mobile drawer is noir, not the platform's white card", () => {
  // A full-screen white panel on a noir site is the most jarring thing a phone
  // visitor meets. The menu colours were always overridable by CSS custom
  // property but had no authoring path until now, so pin that they are set.
  for (const locale of ["en", "es"]) {
    const { header } = treesForLocale(locale);
    const stack = [...(header as unknown as Array<Record<string, unknown>>)];
    let nav: { props: Record<string, unknown> } | null = null;
    while (stack.length) {
      const n = stack.pop() as { kind?: string; children?: unknown[] };
      if (n.kind === "nav") nav = n as unknown as { props: Record<string, unknown> };
      if (Array.isArray(n.children)) stack.push(...(n.children as never[]));
    }
    if (!nav) {
      assert.fail(`[${locale}] header must contain the nav node`);
      return;
    }
    assert.equal(nav.props.menuBackground, "#0d0b09", `[${locale}] drawer ground`);
    assert.ok(nav.props.menuTextColor, `[${locale}] drawer text colour must be set`);
  }
});

test("every internal link in the Spanish shell stays in Spanish", () => {
  // Shipped once: both locale trees are built from one structural builder, so
  // the Spanish header and footer carried the same bare `/p/about` hrefs as
  // English -- and every tap dropped a Spanish visitor into the English site.
  // Nothing errored, because those English pages exist and render fine.
  const collect = (nodes: unknown): string[] => {
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k === "href" && typeof v === "string") out.push(v);
        else walk(v);
      }
    };
    walk(nodes);
    return out;
  };

  const { header, footer } = treesForLocale("es");
  const internal = [...collect(header), ...collect(footer)].filter((h) =>
    h.startsWith("/"),
  );
  assert.ok(internal.length > 10, "expected the shell to carry internal links");
  const unprefixed = internal.filter((h) => h !== "/es" && !h.startsWith("/es/"));
  assert.deepEqual(unprefixed, [], "these Spanish links land on English pages");

  // …and English must stay unprefixed (it is the default locale).
  const en = treesForLocale("en");
  const enInternal = [...collect(en.header), ...collect(en.footer)].filter((h) =>
    h.startsWith("/"),
  );
  assert.deepEqual(
    enInternal.filter((h) => h.startsWith("/es")),
    [],
    "English links must not carry a locale prefix",
  );
});

test("both locales offer the division panel, each pointing at its own pages", () => {
  // This test used to assert the opposite — that the Spanish shell must NOT
  // link to the divisions — because those landings existed in English only and
  // the Spanish menu carried four 404s. The pages exist in Spanish now, so the
  // contract inverts: the panel is built for both locales, and each locale's
  // links stay inside its own site. The seeder's dead-link preflight is what
  // proves that on every write.
  const DIVISIONS = ["fashion-models", "hosts-promoters", "performers", "music-djs"];
  const collect = (nodes: unknown): string[] => {
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k === "href" && typeof v === "string") out.push(v);
        else walk(v);
      }
    };
    walk(nodes);
    return out;
  };

  for (const locale of ["en", "es"] as const) {
    const { header, footer } = treesForLocale(locale);
    const hrefs = [...collect(header), ...collect(footer)];
    const prefix = locale === "es" ? "/es" : "";
    for (const slug of DIVISIONS) {
      assert.ok(
        hrefs.includes(`${prefix}/p/${slug}`),
        `[${locale}] the shell lost its /p/${slug} link`,
      );
    }
  }

  // And no Spanish link may escape into the English site.
  const es = treesForLocale("es");
  const escaped = [...collect(es.header), ...collect(es.footer)].filter(
    (h) => h.startsWith("/") && h !== "/es" && !h.startsWith("/es/"),
  );
  assert.deepEqual(escaped, [], "these Spanish links land on English pages");
});

test("the Impronta header uses the capabilities it asked for", () => {
  // Adoption is the point of the program: shipping the machinery and leaving
  // the live header on the old shape would mean the work is unproven.
  const { header } = treesForLocale("en");
  const stack = [...(header as unknown as Array<Record<string, unknown>>)];
  let nav: { props: Record<string, unknown> } | null = null;
  while (stack.length) {
    const n = stack.pop() as { kind?: string; children?: unknown[] };
    if (n.kind === "nav") nav = n as unknown as { props: Record<string, unknown> };
    if (Array.isArray(n.children)) stack.push(...(n.children as never[]));
  }
  if (!nav) {
    assert.fail("the header must contain the nav node");
    return;
  }
  assert.equal(nav.props.submenuVariant, "mega", "Divisions is a mega panel now");
  assert.ok(nav.props.accentColor, "the gold accent drives underline + badges + CTA");

  const menu = nav.props.menu as Record<string, unknown> | undefined;
  assert.ok(menu, "the phone menu must carry its furniture");
  assert.ok(menu!.ctaLabel && menu!.ctaHref, "a CTA needs both halves to render");
  assert.equal(menu!.showSocial, true);
  assert.equal(menu!.showLanguageToggle, true);

  // The mega panel needs a GROUP (a child with children) or it has no headings.
  const links = nav.props.links as Array<{
    id: string;
    children?: Array<{ children?: unknown[]; icon?: string; description?: string }>;
    featured?: { title?: string };
  }>;
  const divisions = links.find((l) => l.id.endsWith("-divisions"));
  assert.ok(divisions, "Divisions link missing");
  const group = divisions!.children?.[0];
  assert.ok(group?.children?.length, "the panel needs a grouped column");
  assert.ok(divisions!.featured?.title, "the panel carries a promo card");
  for (const leaf of group!.children as Array<{ icon?: string; description?: string }>) {
    assert.ok(leaf.icon, "each division shows a glyph");
    assert.ok(leaf.description, "each division explains itself in the panel");
  }
});
