import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeTree } from "./types";

function tree(links: unknown): BuilderNodeTree {
  return [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "row" },
      children: [{ id: "soc", kind: "social_links", props: { links } }],
    } as unknown as BuilderNode,
  ];
}

/** Markup only — the renderer inlines its stylesheet ahead of the nodes. */
function html(t: BuilderNodeTree): string {
  return renderToStaticMarkup(<>{renderBuilderNodes(t, {} as never)}</>).replace(
    /<style[\s\S]*?<\/style>/g,
    "",
  );
}

test("without an override, the platform glyph renders exactly as before", () => {
  const out = html(
    tree([{ id: "s1", platform: "instagram", href: "https://instagram.com/x" }]),
  );
  assert.match(out, /site-builder-node--social-icon/);
  assert.match(out, /aria-label="Instagram"/);
});

test("an override changes the glyph but NOT the accessible name", () => {
  // The platform still says what the link IS; the icon only says what it looks
  // like. Letting the override rewrite the label would silently mislabel a link
  // for anyone using a screen reader.
  const out = html(
    tree([
      {
        id: "s1",
        platform: "instagram",
        href: "https://instagram.com/x",
        icon: "camera",
      },
    ]),
  );
  assert.match(out, /aria-label="Instagram"/);
  assert.match(out, /data-bn-icon="camera"/);
});

test("each link keeps its own glyph", () => {
  const out = html(
    tree([
      { id: "s1", platform: "instagram", href: "https://a", icon: "camera" },
      { id: "s2", platform: "tiktok", href: "https://b" },
    ]),
  );
  assert.match(out, /data-bn-icon="camera"/);
  assert.match(out, /aria-label="TikTok"/);
});
