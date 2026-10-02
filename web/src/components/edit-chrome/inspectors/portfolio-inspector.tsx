"use client";

/**
 * Content inspector for the W-12 `portfolio` native block.
 * Chapter layout adds collection (album), chapter number, credit, captions.
 */
import { useEffect, useState, type ReactNode } from "react";

import { useBuilderMediaScope } from "@/components/edit-chrome/builder-media-scope";
import {
  PORTFOLIO_DEFAULT_PROPS,
  PORTFOLIO_LAYOUTS,
  portfolioChapterRoman,
  type PortfolioLayout,
} from "@/lib/site-admin/builder-node/portfolio-defaults";
import {
  loadTalentMediaAlbumsForEditor,
  type TalentMediaAlbumOption,
} from "@/lib/site-admin/builder-node/portfolio-albums-actions";
import type { BuilderPortfolioNode } from "@/lib/site-admin/builder-node/types";

import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

const LAYOUT_LABELS: Record<PortfolioLayout, string> = {
  filmstrip: "Filmstrip",
  grid: "Grid",
  masonry: "Masonry",
  contact_sheet: "Contact sheet",
  chapter: "Chapter",
  staggered: "Staggered strip",
  work_order: "Work orders",
};

function Section({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>
        {info ? <InspectorLabelWithInfo label={title} info={info} /> : title}
      </h3>
      {children}
    </section>
  );
}

function useTalentMediaAlbums(): {
  status: "idle" | "loading" | "ready" | "error" | "no_talent";
  albums: TalentMediaAlbumOption[];
  message?: string;
} {
  const { talentProfileId } = useBuilderMediaScope();
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error" | "no_talent"
  >(talentProfileId ? "loading" : "no_talent");
  const [albums, setAlbums] = useState<TalentMediaAlbumOption[]>([]);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!talentProfileId) {
      setStatus("no_talent");
      setAlbums([]);
      return;
    }
    let alive = true;
    setStatus("loading");
    void loadTalentMediaAlbumsForEditor(talentProfileId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        setAlbums([]);
        return;
      }
      setStatus("ready");
      setAlbums(result.albums);
      setMessage(undefined);
    });
    return () => {
      alive = false;
    };
  }, [talentProfileId]);

  return { status, albums, message };
}

export function PortfolioContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderPortfolioNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const layout = (p.layout ?? PORTFOLIO_DEFAULT_PROPS.layout) as PortfolioLayout;
  const showCaptions = p.showCaptions === true;
  const linkMode = p.linkMode ?? PORTFOLIO_DEFAULT_PROPS.linkMode;
  const columns =
    p.columns ?? (layout === "contact_sheet" ? 4 : layout === "masonry" ? 2 : 3);
  const isChapter = layout === "chapter";
  const chapterNumber = Math.min(Math.max(p.chapterNumber ?? 1, 1), 20);
  const albumId = p.albumId?.trim() || "";
  const albumsState = useTalentMediaAlbums();

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="portfolio"
      data-portfolio-inspector="content"
    >
      <Section
        title="Content"
        info={
          isChapter
            ? "One chapter binds to a media album. Number, title, and credit stick on desktop while photos scroll."
            : "Live photos from your media library. Captions are optional; linking opens the tagged service."
        }
      >
        {isChapter ? (
          <>
            <div className={KIT.field}>
              <label className={KIT.label}>Collection</label>
              <select
                className={KIT.input}
                value={albumId}
                onChange={(e) => commitPatch({ albumId: e.target.value })}
                data-portfolio-album-select
              >
                <option value="">All photos</option>
                {albumsState.albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {albumsState.status === "loading" ? (
                <p className="text-[12px] text-stone-500">Loading albums…</p>
              ) : null}
              {albumsState.status === "no_talent" ? (
                <p className="text-[12px] text-stone-500">
                  Open a talent website editor to pick an album. The id still saves.
                </p>
              ) : null}
              {albumsState.status === "error" ? (
                <p className="text-[12px] text-stone-500">
                  Could not load albums ({albumsState.message}). Manage albums in Media.
                </p>
              ) : null}
              {albumsState.status === "ready" && albumsState.albums.length === 0 ? (
                <p className="text-[12px] text-stone-500">
                  No albums yet. Create albums in the talent Media drawer, then pick one here.
                </p>
              ) : null}
            </div>
            <div className={KIT.field}>
              <label className={KIT.label}>
                Chapter number{" "}
                <span className="font-normal text-stone-500">
                  ({portfolioChapterRoman(chapterNumber)})
                </span>
              </label>
              <input
                className={KIT.input}
                type="number"
                min={1}
                max={20}
                value={chapterNumber}
                onChange={(e) =>
                  commitPatch({
                    chapterNumber: Math.min(
                      Math.max(Number.parseInt(e.target.value, 10) || 1, 1),
                      20,
                    ),
                  })
                }
              />
            </div>
            <div className={KIT.field}>
              <label className={KIT.label}>Title</label>
              <input
                className={KIT.input}
                value={p.title ?? PORTFOLIO_DEFAULT_PROPS.title ?? ""}
                placeholder="Editorial"
                onChange={(e) => commitPatch({ title: e.target.value })}
              />
            </div>
            <div className={KIT.field}>
              <label className={KIT.label}>Credit line</label>
              <input
                className={KIT.input}
                value={p.creditLine ?? ""}
                placeholder="Photographer, client, year"
                onChange={(e) => commitPatch({ creditLine: e.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <div className={KIT.field}>
              <label className={KIT.label}>Eyebrow</label>
              <input
                className={KIT.input}
                value={p.eyebrow ?? ""}
                placeholder="Optional"
                onChange={(e) => commitPatch({ eyebrow: e.target.value })}
              />
            </div>
            <div className={KIT.field}>
              <label className={KIT.label}>Heading</label>
              <input
                className={KIT.input}
                value={p.title ?? PORTFOLIO_DEFAULT_PROPS.title ?? ""}
                placeholder="Recent work"
                onChange={(e) => commitPatch({ title: e.target.value })}
              />
            </div>
          </>
        )}
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showCaptions}
            onChange={(e) => commitPatch({ showCaptions: e.target.checked })}
          />
          <span>
            Show captions
            <span className="mt-0.5 block text-[12px] text-stone-500">
              Optional captions and the linked service name under each photo.
            </span>
          </span>
        </label>
        {/* The renderer reads `cardStyle === "framed"`: raised cards with an italic name and a round arrow. */}
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={p.cardStyle === "framed"}
            onChange={(e) => commitPatch({ cardStyle: e.target.checked ? "framed" : "plain" })}
          />
          <span>
            Framed cards
            <span className="mt-0.5 block text-[12px] text-stone-500">
              Each photo sits in a raised card with its name and an arrow. Needs captions on to show the name.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={linkMode !== "none"}
            onChange={(e) =>
              commitPatch({ linkMode: e.target.checked ? "offering" : "none" })
            }
          />
          <span>
            Link photos to a service
            <span className="mt-0.5 block text-[12px] text-stone-500">
              When a photo is tagged to a service in your catalogue, tapping it opens that service.
            </span>
          </span>
        </label>
        <div className={KIT.field}>
          <label className={KIT.label}>Empty message</label>
          <input
            className={KIT.input}
            value={p.emptyMessage ?? PORTFOLIO_DEFAULT_PROPS.emptyMessage ?? ""}
            onChange={(e) => commitPatch({ emptyMessage: e.target.value })}
          />
        </div>
      </Section>
      <Section title="Layout">
        <div className="flex flex-wrap gap-1.5">
          {PORTFOLIO_LAYOUTS.map((l) => {
            const active = layout === l;
            return (
              <button
                key={l}
                type="button"
                className={
                  active
                    ? "rounded-full bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white"
                    : "rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-800"
                }
                onClick={() =>
                  commitPatch(
                    l === "chapter"
                      ? { layout: l, limit: p.limit ?? 6 }
                      : { layout: l },
                  )
                }
              >
                {LAYOUT_LABELS[l]}
              </button>
            );
          })}
        </div>
        {layout === "work_order" ? (
          <p className="text-[12px] text-stone-600">
            Job cards. Write each photo caption on two lines: the job on the first, the work order detail on the second. No faces or client names.
          </p>
        ) : null}
        {layout !== "filmstrip" && layout !== "chapter" && layout !== "work_order" ? (
          <div className="flex flex-wrap gap-1.5">
            {([2, 3, 4] as const).map((n) => {
              const active = columns === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={
                    active
                      ? "rounded-full bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white"
                      : "rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-800"
                  }
                  onClick={() => commitPatch({ columns: n })}
                >
                  {n} columns
                </button>
              );
            })}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
