import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { portfolioTagList, shotMatchesTag } from "./portfolio-tag-filter";
import { PortfolioTagBar } from "./portfolio-tag-bar";
import { renderPortfolioBlock } from "./portfolio-block";
import { portfolioPropsSchema } from "./registry";
import { filterShotsForPortfolio } from "./portfolio-selection";
import type { BuilderPortfolioNode } from "./types";
import type { TalentPortfolioShot } from "./portfolio-types";

const shot = (id: string, tag?: string | null): TalentPortfolioShot => ({
  id,
  url: `https://example.test/${id}.jpg`,
  alt: id,
  tag: tag ?? null,
});

test("tag list: first-seen order, case-insensitive dedupe, counts, blanks ignored", () => {
  const list = portfolioTagList([shot("1", "Headshots"), shot("2", "retrato"), shot("3", "headshots"), shot("4", ""), shot("5", null), shot("6", "Retrato")]);
  assert.deepEqual(list, [
    { label: "Headshots", count: 2 },
    { label: "retrato", count: 2 },
  ]);
});

test("shotMatchesTag: null active tag matches everything", () => {
  assert.equal(shotMatchesTag(shot("1", "A"), null), true);
  assert.equal(shotMatchesTag(shot("1", "A"), "a"), true);
  assert.equal(shotMatchesTag(shot("1", "A"), "B"), false);
  assert.equal(shotMatchesTag(shot("1"), "B"), false);
});

test("a binding tag overrides the media tag", () => {
  const out = filterShotsForPortfolio([shot("1", "A"), shot("2", "B")], { shotBindings: [{ mediaId: "1", tag: "Familia" }] });
  assert.equal(out[0]!.tag, "Familia");
  assert.equal(out[1]!.tag, "B");
});

test("schema accepts tagFilter and a binding tag, rejects an over-long tag", () => {
  assert.ok(portfolioPropsSchema.safeParse({ layout: "contact_sheet", tagFilter: true, shotBindings: [{ mediaId: "1", tag: "Headshots" }] }).success);
  assert.equal(portfolioPropsSchema.safeParse({ shotBindings: [{ mediaId: "1", tag: "x".repeat(41) }] }).success, false);
});

const node = (props: BuilderPortfolioNode["props"]): BuilderPortfolioNode => ({ id: "p1", kind: "portfolio", props }) as BuilderPortfolioNode;
const shots = [shot("1", "Headshots"), shot("2", "Familia"), shot("3", "Headshots")];
const render = (props: BuilderPortfolioNode["props"], locale = "en") =>
  renderToStaticMarkup(<>{renderPortfolioBlock({ node: node(props), shots, locale })}</>);

test("renderer: tagFilter off (default) renders no bar and no tag attrs gate", () => {
  const html = render({ layout: "contact_sheet" });
  assert.doesNotMatch(html, /data-portfolio-tag-bar/);
});

test("renderer: tagFilter on renders the bar with counts and tags every figure (EN)", () => {
  const html = render({ layout: "contact_sheet", tagFilter: true });
  assert.match(html, /data-portfolio-tag-bar/);
  assert.match(html, />All(<!-- -->)? <span/);
  assert.match(html, /Headshots/);
  assert.match(html, /data-portfolio-tag="Familia"/);
  assert.equal((html.match(/data-portfolio-tag=/g) ?? []).length, 3);
});

test("renderer: Spanish default label is Todo, never All", () => {
  const html = render({ layout: "contact_sheet", tagFilter: true }, "es");
  assert.match(html, />Todo(<!-- -->)? <span/);
  assert.doesNotMatch(html, />All(<!-- -->)? <span/);
});

test("renderer: a single tag (nothing to filter) renders no bar", () => {
  const html = renderToStaticMarkup(
    <>{renderPortfolioBlock({ node: node({ layout: "contact_sheet", tagFilter: true }), shots: [shot("1", "A"), shot("2", "A")], locale: "en" })}</>,
  );
  assert.doesNotMatch(html, /data-portfolio-tag-bar/);
});

test("tag bar: tablist semantics, first chip pressed, 44px-ready buttons", () => {
  const html = renderToStaticMarkup(<PortfolioTagBar allLabel="Todo" total={3} tags={[{ label: "Headshots", count: 2 }]} />);
  assert.match(html, /aria-pressed="true"[^>]*>Todo/);
  assert.match(html, /aria-pressed="false"[^>]*>Headshots/);
});
