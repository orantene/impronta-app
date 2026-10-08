/**
 * Test fixtures for theme releases (imported by the *.test.ts files only).
 * A tiny two-tree Design with keyed sections, nested children, a
 * services_catalog, a shell header + footer and `{{token}}` content, plus a
 * fake hydration that mirrors `hydrateTalentTree` (string swap).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { getPath, propsOf, refreshOriginFingerprints, setPath, stampDesignOrigin } from "./origin";
import { findKeyPath, updateAt, updateList } from "./tree-ops";
import type { DesignSide } from "./types";

export type Opts = {
  heroVariant?: string;
  heroPadding?: string;
  menuLayout?: string;
  ctaLabel?: string;
  order?: string[];
  withGallery?: boolean;
  aboutKind?: "container" | "section";
  dropFaq?: boolean;
  extraHeroChild?: boolean;
  headerSticky?: boolean;
  footerTone?: string;
};

let n = 0;
const id = () => `n-${(n += 1)}`;

function node(kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode {
  return { id: id(), kind, props, ...(children ? { children } : {}) } as unknown as BuilderNode;
}

export function rawDesign(o: Opts = {}): { shell: BuilderNode[]; home: BuilderNode[] } {
  const sections: Record<string, BuilderNode> = {
    hero: node("container", { slotKey: "hero", variant: o.heroVariant ?? "split", style: { paddingY: o.heroPadding ?? "l" } }, [
      node("heading", { text: "{{displayName}}", level: 1, style: { size: "xxl" } }),
      node("paragraph", { text: "{{tagline}}", style: { size: "m" } }),
      node("button", { label: o.ctaLabel ?? "Book now", href: "{{inquireHref}}", variant: "solid" }),
      ...(o.extraHeroChild ? [node("paragraph", { text: "Open today", style: { size: "s" } })] : []),
    ]),
    menu: node("container", { slotKey: "menu", layout: "stack" }, [
      node("services_catalog", { layout: o.menuLayout ?? "rows", categoryNav: "rail", density: "comfortable", title: "Services" }),
    ]),
    about: node(o.aboutKind ?? "container", { slotKey: "about", layout: "split" }, [
      node("image", { src: "{{headshotUrl}}", radius: "arch" }),
      node("paragraph", { text: "{{bio}}" }),
    ]),
    faq: node("container", { slotKey: "faq", layout: "stack" }, [node("faq", { variant: "accordion" })]),
    ...(o.withGallery
      ? { gallery: node("container", { slotKey: "gallery", layout: "grid" }, [node("image", { src: "{{gallery0}}" })]) }
      : {}),
  };
  const order = o.order ?? ["hero", "menu", "about", ...(o.withGallery ? ["gallery"] : []), "faq"];
  const home = order.filter((k) => sections[k] && !(o.dropFaq && k === "faq")).map((k) => sections[k]!);
  const shell = [
    node("site_header", { slotKey: "header", sticky: o.headerSticky ?? true, navChrome: "pill", brand: "{{displayName}}" }),
    node("container", { slotKey: "footer", tone: o.footerTone ?? "dark" }, [
      node("paragraph", { text: "© {{year}} {{displayName}}", layerLabel: "Copyright" }),
    ]),
  ];
  return { shell, home };
}

const CONTENT: Record<string, string> = {
  displayName: "Valeria",
  tagline: "Nails in Roma Norte",
  inquireHref: "/t/TAL-1/inquire",
  headshotUrl: "https://img.test/v.jpg",
  bio: "Ten years of nail art.",
  gallery0: "https://img.test/g0.jpg",
  year: "2026",
};

function hydrate(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => CONTENT[k] ?? "");
  if (Array.isArray(value)) return value.map(hydrate);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        k === "__origin" ? [k, v] : [k, hydrate(v)],
      ),
    );
  }
  return value;
}

/** Design at `version`, stamped + hydrated with the talent's content. */
export function built(version: number, o: Opts = {}, tokens: Record<string, string> = {}): DesignSide {
  const raw = rawDesign(o);
  const src = { design: "maison-v2", version };
  return {
    trees: {
      shell: refreshOriginFingerprints(hydrate(stampDesignOrigin(raw.shell, src)) as BuilderNode[]),
      home: refreshOriginFingerprints(hydrate(stampDesignOrigin(raw.home, src)) as BuilderNode[]),
    },
    tokens,
  };
}

/** Set a prop on the node keyed `key` (a talent edit). */
export function edit(side: DesignSide, tree: string, key: string, path: string, value: unknown): DesignSide {
  const t = side.trees[tree]!;
  const at = findKeyPath(t, key);
  if (!at) throw new Error(`no ${key}`);
  const next = updateAt(t, at, (nd) => ({ ...nd, props: setPath(propsOf(nd), path, value !== undefined, value) }) as BuilderNode);
  return { ...side, trees: { ...side.trees, [tree]: next } };
}

export function removeKey(side: DesignSide, tree: string, key: string): DesignSide {
  const t = side.trees[tree]!;
  const at = findKeyPath(t, key);
  if (!at) throw new Error(`no ${key}`);
  return { ...side, trees: { ...side.trees, [tree]: updateAt(t, at, () => null) } };
}

/** Append a talent-added (unstamped) node under `parentKey` (null = root). */
export function addNode(side: DesignSide, tree: string, parentKey: string | null, nd: BuilderNode, index?: number): DesignSide {
  const next = updateList(side.trees[tree]!, parentKey, (list) => {
    const out = [...list];
    out.splice(index ?? out.length, 0, nd);
    return out;
  });
  if (!next) throw new Error(`no parent ${parentKey}`);
  return { ...side, trees: { ...side.trees, [tree]: next } };
}

export function plain(kind: string, props: Record<string, unknown>): BuilderNode {
  return node(kind, props);
}

export function prop(side: DesignSide, tree: string, key: string, path: string): unknown {
  const t = side.trees[tree]!;
  const at = findKeyPath(t, key);
  if (!at) return undefined;
  let cur: BuilderNode | undefined;
  let list: BuilderNode[] = t;
  for (const i of at) {
    cur = list[i];
    list = (cur as { children?: BuilderNode[] }).children ?? [];
  }
  return cur ? getPath(propsOf(cur), path).value : undefined;
}

export function topKeys(side: DesignSide, tree: string): string[] {
  return side.trees[tree]!.map((nd) => {
    const o = propsOf(nd).__origin as { key?: string } | undefined;
    return o?.key ?? `+${nd.kind}`;
  });
}
