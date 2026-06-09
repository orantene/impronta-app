import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NEW_PAGE_STARTER_SHELL_MAX_WIDTH_PX,
  NEW_PAGE_STARTER_SLOT_KEY,
  buildNewPageStarterBuilderTree,
  newPageStarterShellStyle,
} from "./new-page-starter-tree";

test("buildNewPageStarterBuilderTree seeds blank_section with a content shell", () => {
  const sectionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tree = buildNewPageStarterBuilderTree(sectionId);
  assert.equal(tree.length, 1);
  const section = tree[0];
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(section.props.sectionTypeKey, "blank_section");
  assert.equal(section.props.sectionId, sectionId);
  assert.equal(section.props.slotKey, NEW_PAGE_STARTER_SLOT_KEY);
  assert.equal(section.children?.length, 1);
  const shell = section.children?.[0];
  assert.equal(shell?.kind, "container");
  if (!shell || shell.kind !== "container") return;
  assert.equal(shell.props.layout, "stack");
  assert.equal(
    shell.props.style?.maxWidthFree,
    `${NEW_PAGE_STARTER_SHELL_MAX_WIDTH_PX}px`,
  );
  assert.equal(shell.props.style?.marginLeftFree, "auto");
  assert.equal(shell.props.style?.paddingTop, "48px");
  assert.equal(shell.props.style?.responsive?.tablet?.paddingLeft, "28px");
  assert.equal(shell.props.style?.responsive?.mobile?.paddingLeft, "16px");
});

test("newPageStarterShellStyle exposes responsive margin and padding", () => {
  const style = newPageStarterShellStyle();
  assert.equal(style.responsive.tablet.marginTopFree, "20px");
  assert.equal(style.responsive.mobile.paddingBottom, "32px");
});
