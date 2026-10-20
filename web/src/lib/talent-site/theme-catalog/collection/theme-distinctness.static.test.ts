/**
 * Distinctness matrix (O6, TUL-37): a theme is only proposed for release if it
 * differs from every other design on at least 4 of 6 payload-derived axes, and
 * on at least one STRUCTURE axis (hero, nav chrome, content shape). Fed by the
 * real payloads so a recoloured clone fails CI. Talent designs only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GALLERY_DESIGNS } from "../gallery-meta";
import { COLLECTION_DESIGNS } from "./designs";

export const DISTINCTNESS_MIN_AXES = 4;
const STRUCTURE_AXES = ["hero", "nav", "content"] as const;
const AXES = ["hero", "nav", "content", "type", "palette", "shape"] as const;
type Axis = (typeof AXES)[number];

type Node = { kind?: string; props?: Record<string, unknown>; children?: Node[] };

function collect(nodes: Node[], kinds: Set<string>) {
  for (const n of nodes) {
    if (n.kind) kinds.add(n.kind);
    const layout = n.props?.layout;
    if (n.kind === "portfolio" && typeof layout === "string") kinds.add(`portfolio/${layout}`);
    if (n.children) collect(n.children, kinds);
  }
}

function hueBucket(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "none";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return "neutral";
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  return `hue${Math.floor(h / 60)}`;
}

function lum(hex: string): "light" | "dark" {
  const n = parseInt(hex.replace("#", ""), 16);
  const y = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return y > 0.5 ? "light" : "dark";
}

export function fingerprint(slug: string): Record<Axis, string> {
  const entry = COLLECTION_DESIGNS.find((d) => d.slug === slug)!;
  const payload = entry.buildPayload();
  const home = payload.homeTree as unknown as Node[];
  const hero = home[0]!;
  const heroProps = hero.props ?? {};
  const shell = JSON.stringify(payload.shellTree);
  const kinds = new Set<string>();
  collect(home, kinds);
  const gallery = GALLERY_DESIGNS.find((d) => d.slug === slug);
  const heading = gallery?.fonts?.heading?.split(",")[0]?.replace(/["']/g, "").trim() ?? "platform-default";
  const pal = gallery?.palettes[0];
  const homeJson = JSON.stringify(home);
  return {
    hero: [hero.kind, heroProps.ratio ?? heroProps.layout ?? "", heroProps.align ?? ""].join("|"),
    nav: /"navChrome":"([^"]+)"/.exec(shell)?.[1] ?? "standard",
    content: [...kinds].sort().join(","),
    type: heading,
    palette: pal ? `${lum(pal.page)}-${hueBucket(pal.accent)}` : "none",
    shape: `${/"photoRadius":"(\w+)"/.exec(homeJson)?.[1] ?? "none"}-${/"density":"(\w+)"/.exec(homeJson)?.[1] ?? "none"}`,
  };
}

export function distinctAxes(a: Record<Axis, string>, b: Record<Axis, string>): Axis[] {
  return AXES.filter((k) => a[k] !== b[k]);
}

/**
 * Draft designs whose dev-authored pack is being replaced by a 1:1 port of the
 * owner original (TH20-Mono, O1). Their pairs report as todo (still run, do not
 * gate) until the port lands; remove the slug here then.
 */
const PORT_PENDING: ReadonlySet<string> = new Set([]);

describe("theme distinctness matrix (O6)", () => {
  const slugs = COLLECTION_DESIGNS.map((d) => d.slug);
  it("a recoloured clone fails the threshold (self-check of the rule)", () => {
    const f = fingerprint("folio");
    const clone = { ...f, palette: "dark-hue0", type: "Other" };
    assert.ok(distinctAxes(f, clone).length < DISTINCTNESS_MIN_AXES);
    assert.equal(distinctAxes(f, clone).filter((a) => (STRUCTURE_AXES as readonly string[]).includes(a)).length, 0);
  });
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i]!;
      const b = slugs[j]!;
      const pending = PORT_PENDING.has(a) || PORT_PENDING.has(b);
      it(`${a} vs ${b} differ on >= ${DISTINCTNESS_MIN_AXES} axes incl. one structure axis`, pending ? { todo: "draft pack pending 1:1 port" } : {}, () => {
        const d = distinctAxes(fingerprint(a), fingerprint(b));
        assert.ok(d.length >= DISTINCTNESS_MIN_AXES, `only ${d.join(",") || "nothing"} differ`);
        assert.ok(
          d.some((x) => (STRUCTURE_AXES as readonly string[]).includes(x)),
          "no structure axis (hero, nav, content) differs",
        );
      });
    }
  }
});
