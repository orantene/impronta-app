/**
 * Masthead — giant stacked words over an optional B&W cover.
 * Shared W-10 hero variant; Designs stamp via `heroMasthead`. No live data source.
 */
import type { CSSProperties, ReactNode } from "react";

import { anchorIdAttrs } from "./anchor-id";
import { MAGAZINE_INDEX_CSS, renderMagazineIndex } from "./contents-block";
import {
  MAGAZINE_BUTTON_CSS,
  MAGAZINE_LABEL_FONT_HREF,
  MAGAZINE_ROOT_VARS,
} from "./magazine-edition";
import {
  MASTHEAD_DEFAULT_PROPS,
  type MastheadCoverFilter,
} from "./masthead-defaults";
import type { BuilderMastheadNode } from "./types";

export const MASTHEAD_CSS = `
.sb-masthead{position:relative;width:100%;min-width:0;box-sizing:border-box;color:var(--token-color-ink);font:inherit;isolation:isolate}
.sb-masthead[data-masthead-cover="1"]{color:var(--token-color-background,Canvas);min-height:clamp(28rem,82vh,56rem)}
.sb-masthead-cover,.sb-masthead-scrim{position:absolute;inset:0;z-index:0;pointer-events:none}
.sb-masthead-cover{background-size:cover;background-position:center;background-repeat:no-repeat}
.sb-masthead[data-masthead-filter="bw"] .sb-masthead-cover{filter:grayscale(1) contrast(1.05)}
.sb-masthead-scrim{background:linear-gradient(180deg,color-mix(in srgb,var(--token-color-ink,CanvasText) 12%,transparent) 0%,color-mix(in srgb,var(--token-color-ink,CanvasText) 70%,transparent) 100%)}
.sb-masthead-body{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;gap:clamp(0.85rem,2vw,1.5rem);width:100%;min-height:inherit;box-sizing:border-box;padding:clamp(2rem,6vw,4.5rem) clamp(1.1rem,4vw,3rem)}
.sb-masthead-stack{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:0;max-width:100%}
.sb-masthead-line{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-size:clamp(3.25rem,16vw,10.5rem);font-weight:400;line-height:0.88;letter-spacing:-0.045em;text-transform:uppercase;text-wrap:balance;color:inherit}
.sb-masthead-meta{display:flex;flex-direction:column;gap:0.35rem;max-width:36rem}
.sb-masthead-subline{margin:0;font-size:0.78rem;letter-spacing:0.18em;text-transform:uppercase;opacity:0.88}
.sb-masthead-credit{margin:0;font-size:0.92rem;letter-spacing:0.02em;opacity:0.78;font-family:var(--token-typography-body-font-family,var(--site-body-font,system-ui,sans-serif))}
.sb-masthead[data-masthead-cover="0"] .sb-masthead-body{padding-block:clamp(2.5rem,7vw,5rem)}
`;

/**
 * Magazine edition: sticky-free issue spread. Mast line, the name across the
 * full width (one line on desktop, stacked words on a phone), then a B&W
 * cover beside a serif bio, square CTAs and the "In this issue" index.
 */
export const MASTHEAD_MAGAZINE_CSS = `
.sb-masthead[data-edition="magazine"]{${MAGAZINE_ROOT_VARS};container:sbmag/inline-size;color:var(--sb-mag-ink);min-height:0;padding:0 0 8px}
.sb-mag-mast{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;padding:14px 16px 10px;font:600 10.5px/1.2 var(--sb-mag-label);letter-spacing:.2em;text-transform:uppercase;color:var(--sb-mag-mute)}
.sb-mag-name{margin:0;padding:0 12px;font:400 clamp(84px,27cqi,330px)/.8 var(--sb-mag-serif);letter-spacing:-.045em;text-transform:uppercase;white-space:nowrap;color:var(--sb-mag-ink)}
.sb-mag-name span{display:block}
.sb-mag-cover{position:relative;margin:12px 16px 0;aspect-ratio:3/4;overflow:hidden;background:var(--sb-mag-tint)}
.sb-mag-cover img{display:block;width:100%;height:100%;object-fit:cover}
.sb-masthead[data-masthead-filter="bw"] .sb-mag-cover img{filter:grayscale(1) contrast(1.05)}
.sb-mag-lines{position:absolute;left:14px;right:14px;bottom:14px;display:grid;gap:8px;color:white}
.sb-mag-lines small{font:600 10.5px/1.2 var(--sb-mag-label);letter-spacing:.2em;text-transform:uppercase;text-shadow:0 1px 12px color-mix(in srgb,black 45%,transparent)}
.sb-mag-tag{padding:16px 16px 0;display:grid;gap:14px}
.sb-mag-tag p{margin:0;font:400 21px/1.3 var(--sb-mag-serif);color:var(--sb-mag-ink)}
.sb-mag-row{display:flex;gap:8px;flex-wrap:wrap}
.sb-mag-side .sb-mag-toc{margin:36px 16px 0;width:auto}
${MAGAZINE_BUTTON_CSS}
@media (min-width:900px){
  .sb-masthead[data-edition="magazine"] .sb-mag-mast{padding:16px 40px 8px}
  .sb-masthead[data-edition="magazine"] .sb-mag-name{padding:0 32px;font-size:clamp(84px,19cqi,300px);white-space:nowrap}
  .sb-masthead[data-edition="magazine"] .sb-mag-name span{display:inline}
  .sb-masthead[data-edition="magazine"] .sb-mag-spread{display:grid;grid-template-columns:1.25fr 1fr;gap:32px;padding:18px 40px 0;align-items:end}
  .sb-masthead[data-edition="magazine"] .sb-mag-cover{margin:0;aspect-ratio:4/3.4}
  .sb-masthead[data-edition="magazine"] .sb-mag-tag{padding:0 0 6px}
  .sb-masthead[data-edition="magazine"] .sb-mag-tag p{font-size:34px;line-height:1.25}
  .sb-masthead[data-edition="magazine"] .sb-mag-side .sb-mag-toc{margin:0}
}
@container sbmag (min-width:900px){
  .sb-mag-mast{padding:16px 40px 8px}
  .sb-mag-name{padding:0 32px;font-size:clamp(84px,19cqi,300px)}
  .sb-mag-name span{display:inline}
  .sb-mag-spread{display:grid;grid-template-columns:1.25fr 1fr;gap:32px;padding:18px 40px 0;align-items:end}
  .sb-mag-cover{margin:0;aspect-ratio:4/3.4}
  .sb-mag-tag{padding:0 0 6px}
  .sb-mag-tag p{font-size:34px;line-height:1.25}
  .sb-mag-side .sb-mag-toc{margin:0}
}
`;

const SEASONS = {
  en: ["Winter", "Spring", "Summer", "Autumn"],
  es: ["Invierno", "Primavera", "Verano", "Otoño"],
} as const;

/** "Vol. 09 · Autumn 2026": the issue is the month, the season its quarter. */
export function magazineIssueLine(locale: string | undefined, now: Date = new Date()): string {
  const month = now.getMonth();
  const season = (locale ?? "").toLowerCase().startsWith("es") ? SEASONS.es : SEASONS.en;
  const idx = month === 11 || month < 2 ? 0 : month < 5 ? 1 : month < 8 ? 2 : 3;
  return `Vol. ${String(month + 1).padStart(2, "0")} · ${season[idx]} ${now.getFullYear()}`;
}

function magazineCopy(locale: string | undefined) {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  return es
    ? { book: "Ver el libro", contents: "En este número" }
    : { book: "See the book", contents: "In this issue" };
}

function renderMagazine(args: {
  node: BuilderMastheadNode;
  styleAttr?: CSSProperties;
  locale?: string;
  words: string[];
  coverSrc: string;
  coverFilter: MastheadCoverFilter;
}): ReactNode {
  const { node, styleAttr, locale, words, coverSrc, coverFilter } = args;
  const p = node.props;
  const copy = magazineCopy(locale);
  const name = words.join(" ");
  const bio = (p.bio ?? "").trim();
  const coverLine = (p.coverLine ?? p.subline ?? "").trim();
  const mastRight = (p.mastRight ?? "").trim();
  const ctaLabel = (p.ctaLabel ?? "").trim();
  const ctaHref = (p.ctaHref ?? "").trim();
  const bookLabel = (p.bookLabel ?? "").trim() || copy.book;
  const bookHref = (p.bookHref ?? "").trim();
  const contentsTitle = (p.contentsTitle ?? "").trim() || copy.contents;
  const index = renderMagazineIndex({ title: contentsTitle, items: p.contents ?? [] });
  return (
    <section
      className="sb-masthead"
      data-builder-kind="masthead"
      data-edition="magazine"
      data-masthead-filter={coverFilter}
      aria-label={name || "Masthead"}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <link rel="stylesheet" href={MAGAZINE_LABEL_FONT_HREF} />
      <style>{MASTHEAD_MAGAZINE_CSS}</style>
      <style>{MAGAZINE_INDEX_CSS}</style>
      <div className="sb-mag-mast">
        <span>{magazineIssueLine(locale)}</span>
        {mastRight ? <span>{mastRight}</span> : null}
      </div>
      {words.length > 0 ? (
        <h1 className="sb-mag-name">
          {words.map((w, i) => (
            <span key={`${i}:${w}`}>
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>
      ) : null}
      <div className="sb-mag-spread">
        {coverSrc ? (
          <figure className="sb-mag-cover">
            {/* eslint-disable-next-line @next/next/no-img-element -- token-hydrated cover URL */}
            <img src={coverSrc} alt={name} />
            {coverLine ? (
              <figcaption className="sb-mag-lines">
                <small>{coverLine}</small>
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <div />
        )}
        <div className="sb-mag-side">
          {bio || ctaLabel || bookHref ? (
            <div className="sb-mag-tag">
              {bio ? <p>{bio}</p> : null}
              <div className="sb-mag-row">
                {ctaLabel && ctaHref ? (
                  <a className="sb-mag-btn" href={ctaHref}>
                    {ctaLabel}
                  </a>
                ) : null}
                {bookHref ? (
                  <a className="sb-mag-btn" data-ghost="1" href={bookHref}>
                    {bookLabel}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
          {index}
        </div>
      </div>
    </section>
  );
}

function normalizeLines(
  raw: ReadonlyArray<string> | undefined,
  splitWords: boolean,
): string[] {
  const authored = (raw ?? [])
    .map((line) => (line ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (authored.length === 0) return [];
  if (splitWords && authored.length === 1) {
    const parts = authored[0]!.split(/\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(0, 8);
  }
  return authored;
}

export function renderMastheadBlock(args: {
  node: BuilderMastheadNode;
  styleAttr?: CSSProperties;
  locale?: string;
}): ReactNode {
  const { node, styleAttr } = args;
  const p = node.props;
  const splitWords = p.splitWords !== false;
  const lines = normalizeLines(p.lines, splitWords);
  const showCover = p.showCover !== false;
  const coverFilter = (p.coverFilter ??
    MASTHEAD_DEFAULT_PROPS.coverFilter ??
    "bw") as MastheadCoverFilter;
  const coverSrc = (p.coverSrc ?? MASTHEAD_DEFAULT_PROPS.coverSrc ?? "").trim();
  const subline = (p.subline ?? "").trim();
  const creditLine = (p.creditLine ?? "").trim();
  const hasCover = showCover && Boolean(coverSrc);

  if (p.edition === "magazine") {
    return renderMagazine({
      node,
      styleAttr,
      locale: args.locale,
      words: normalizeLines(p.lines, true),
      coverSrc: showCover ? coverSrc : "",
      coverFilter,
    });
  }

  return (
    <section
      className="sb-masthead"
      data-builder-kind="masthead"
      data-masthead-cover={hasCover ? "1" : "0"}
      data-masthead-filter={coverFilter}
      aria-label={lines.join(" ") || "Masthead"}
      style={styleAttr}
      {...anchorIdAttrs(node)}
    >
      <style>{MASTHEAD_CSS}</style>
      {hasCover ? (
        <>
          <div
            className="sb-masthead-cover"
            style={{ backgroundImage: `url(${coverSrc})` }}
            aria-hidden
          />
          <div className="sb-masthead-scrim" aria-hidden />
        </>
      ) : null}
      <div className="sb-masthead-body">
        {lines.length === 0 ? null : (
          <h1 className="sb-masthead-stack">
            {lines.map((line, i) => (
              <span key={`${i}:${line}`} className="sb-masthead-line">
                {line}
              </span>
            ))}
          </h1>
        )}
        {subline || creditLine ? (
          <div className="sb-masthead-meta">
            {subline ? <p className="sb-masthead-subline">{subline}</p> : null}
            {creditLine ? <p className="sb-masthead-credit">{creditLine}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
