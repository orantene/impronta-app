"use client";

/**
 * PostBlockEditor — one block in the writer: its fields plus move / delete.
 * Mobile-first: every control is at least 44px tall, one column.
 */

import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert, X } from "lucide-react";

import { postVideoEmbedUrl } from "@/lib/cms/post-blocks";
import type { WriterOffering } from "@/lib/cms/post-writer-types";
import type { EditorBlock } from "./editor-blocks";
import { PostImageField } from "./PostImageField";
import type { PostsT } from "./posts-t";

export type PostBlockMedia = { mediaTenantId: string; mediaTalentProfileId: string | null };

export type PostBlockEditorProps = {
  block: EditorBlock;
  index: number;
  count: number;
  t: PostsT;
  offerings: readonly WriterOffering[];
  media: PostBlockMedia;
  disabled: boolean;
  onChange: (next: EditorBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
};

const INPUT =
  "w-full rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[10px] text-[15px] text-admin-ink placeholder:text-admin-ink-dim disabled:opacity-60";
const ICON_BTN =
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-admin-md border-0 bg-transparent text-admin-ink-muted hover:bg-admin-surface-alt disabled:cursor-default disabled:opacity-40";
const CHIP =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-admin-md border px-[12px] text-[13px] font-medium";

export function PostBlockEditor(props: PostBlockEditorProps) {
  const { block, index, count, t, disabled, onMove, onDelete } = props;
  return (
    <section
      data-testid={`post-block-${block.type}`}
      className="rounded-admin-lg border border-admin-border bg-admin-card p-[12px]"
    >
      <div className="mb-[8px] flex items-center justify-between gap-[4px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-admin-ink-dim">
          {blockLabel(block.type, t)}
        </span>
        {!disabled ? (
          <span className="flex items-center">
            <button
              type="button"
              className={ICON_BTN}
              disabled={index === 0}
              onClick={() => onMove(-1)}
              aria-label={t("dashboard.talentPosts.moveUp")}
            >
              <ChevronUp size={18} />
            </button>
            <button
              type="button"
              className={ICON_BTN}
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              aria-label={t("dashboard.talentPosts.moveDown")}
            >
              <ChevronDown size={18} />
            </button>
            <button
              type="button"
              className={ICON_BTN}
              onClick={onDelete}
              aria-label={t("dashboard.talentPosts.deleteBlock")}
            >
              <Trash2 size={18} />
            </button>
          </span>
        ) : null}
      </div>
      <BlockFields {...props} />
    </section>
  );
}

export function blockLabel(type: EditorBlock["type"], t: PostsT): string {
  switch (type) {
    case "paragraph":
      return t("dashboard.talentPosts.blockText");
    case "heading":
      return t("dashboard.talentPosts.blockHeading");
    case "list":
      return t("dashboard.talentPosts.blockList");
    case "image":
      return t("dashboard.talentPosts.blockPhoto");
    case "gallery":
      return t("dashboard.talentPosts.blockGallery");
    case "quote":
      return t("dashboard.talentPosts.blockQuote");
    case "video":
      return t("dashboard.talentPosts.blockVideo");
    case "divider":
      return t("dashboard.talentPosts.blockDivider");
    case "service":
      return t("dashboard.talentPosts.blockService");
    case "book_button":
      return t("dashboard.talentPosts.blockBook");
    case "faq":
      return t("dashboard.talentPosts.blockFaq");
  }
}

function BlockFields({ block, t, offerings, media, disabled, onChange }: PostBlockEditorProps) {
  switch (block.type) {
    case "paragraph":
      return (
        <textarea
          className={`${INPUT} min-h-[120px] resize-y`}
          rows={4}
          maxLength={20000}
          disabled={disabled}
          value={block.text ?? ""}
          placeholder={t("dashboard.talentPosts.paragraphPlaceholder")}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      );
    case "heading":
      return (
        <div className="flex flex-col gap-[8px]">
          <input
            className={`${INPUT} text-[18px] font-semibold`}
            maxLength={500}
            disabled={disabled}
            value={block.text ?? ""}
            placeholder={t("dashboard.talentPosts.headingPlaceholder")}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
          <div className="flex gap-[8px]">
            {([2, 3] as const).map((level) => (
              <button
                key={level}
                type="button"
                disabled={disabled}
                aria-pressed={block.level === level}
                onClick={() => onChange({ ...block, level })}
                className={`${CHIP} ${
                  block.level === level
                    ? "border-admin-ink bg-admin-ink text-admin-surface"
                    : "border-admin-border bg-admin-card text-admin-ink"
                }`}
              >
                {level === 2
                  ? t("dashboard.talentPosts.headingLevel2")
                  : t("dashboard.talentPosts.headingLevel3")}
              </button>
            ))}
          </div>
        </div>
      );
    case "list": {
      const items = block.items ?? [""];
      return (
        <div className="flex flex-col gap-[8px]">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={block.ordered === true}
            onClick={() => onChange({ ...block, ordered: !block.ordered })}
            className={`${CHIP} self-start ${
              block.ordered
                ? "border-admin-ink bg-admin-ink text-admin-surface"
                : "border-admin-border bg-admin-card text-admin-ink"
            }`}
          >
            {t("dashboard.talentPosts.listOrdered")}
          </button>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-[4px]">
              <input
                className={INPUT}
                maxLength={500}
                disabled={disabled}
                value={item}
                placeholder={t("dashboard.talentPosts.listItemPlaceholder")}
                onChange={(e) =>
                  onChange({ ...block, items: items.map((x, j) => (j === i ? e.target.value : x)) })
                }
              />
              {items.length > 1 && !disabled ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={t("dashboard.talentPosts.removeItem")}
                  onClick={() => onChange({ ...block, items: items.filter((_, j) => j !== i) })}
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          ))}
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange({ ...block, items: [...items, ""] })}
              className={`${CHIP} self-start border-admin-border bg-admin-card text-admin-ink`}
            >
              <Plus size={14} className="mr-[4px]" />
              {t("dashboard.talentPosts.addItem")}
            </button>
          ) : null}
        </div>
      );
    }
    case "image":
      return (
        <div className="flex flex-col gap-[8px]">
          <PostImageField
            value={block.url ? { url: block.url, alt: block.alt ?? null } : null}
            mediaTenantId={media.mediaTenantId}
            mediaTalentProfileId={media.mediaTalentProfileId}
            emptyLabel={t("dashboard.talentPosts.addPhoto")}
            disabled={disabled}
            onChange={(v) =>
              onChange(
                v
                  ? { ...block, url: v.url, alt: block.alt || v.alt || "" }
                  : { id: block.id, type: "image", alt: "" },
              )
            }
          />
          {block.url ? (
            <>
              <input
                className={INPUT}
                maxLength={500}
                disabled={disabled}
                value={block.alt ?? ""}
                placeholder={t("dashboard.talentPosts.photoAlt")}
                onChange={(e) => onChange({ ...block, alt: e.target.value })}
              />
              <input
                className={INPUT}
                maxLength={500}
                disabled={disabled}
                value={block.caption ?? ""}
                placeholder={t("dashboard.talentPosts.photoCaption")}
                onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
              />
            </>
          ) : null}
        </div>
      );
    case "gallery": {
      const images = block.images ?? [];
      return (
        <div className="flex flex-col gap-[8px]">
          {images.map((img, i) => (
            <div key={`${img.url}-${i}`} className="flex items-center gap-[8px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote library URL, size unknown */}
              <img src={img.url} alt="" className="size-[56px] shrink-0 rounded-admin-md object-cover" />
              <input
                className={INPUT}
                maxLength={500}
                disabled={disabled}
                value={img.alt}
                placeholder={t("dashboard.talentPosts.photoAlt")}
                onChange={(e) =>
                  onChange({
                    ...block,
                    images: images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)),
                  })
                }
              />
              {!disabled ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={t("dashboard.talentPosts.removePhoto")}
                  onClick={() => onChange({ ...block, images: images.filter((_, j) => j !== i) })}
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          ))}
          {images.length < 24 ? (
            <PostImageField
              value={null}
              mediaTenantId={media.mediaTenantId}
              mediaTalentProfileId={media.mediaTalentProfileId}
              emptyLabel={t("dashboard.talentPosts.addPhoto")}
              disabled={disabled}
              onChange={(v) => {
                if (v) onChange({ ...block, images: [...images, { url: v.url, alt: v.alt ?? "" }] });
              }}
            />
          ) : null}
        </div>
      );
    }
    case "quote":
      return (
        <div className="flex flex-col gap-[8px]">
          <textarea
            className={`${INPUT} min-h-[88px] resize-y italic`}
            rows={3}
            maxLength={500}
            disabled={disabled}
            value={block.text ?? ""}
            placeholder={t("dashboard.talentPosts.quotePlaceholder")}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
          <input
            className={INPUT}
            maxLength={500}
            disabled={disabled}
            value={block.cite ?? ""}
            placeholder={t("dashboard.talentPosts.citePlaceholder")}
            onChange={(e) => onChange({ ...block, cite: e.target.value || undefined })}
          />
        </div>
      );
    case "video": {
      const url = block.url ?? "";
      const invalid = url.trim().length > 0 && postVideoEmbedUrl(url.trim()) === null;
      return (
        <div className="flex flex-col gap-[6px]">
          <input
            className={INPUT}
            inputMode="url"
            maxLength={500}
            disabled={disabled}
            value={url}
            placeholder={t("dashboard.talentPosts.videoPlaceholder")}
            onChange={(e) => onChange({ ...block, url: e.target.value.trim() || undefined })}
          />
          {invalid ? (
            <p className="m-0 text-[13px] text-admin-ink-muted" role="alert">
              {t("dashboard.talentPosts.videoInvalid")}
            </p>
          ) : null}
        </div>
      );
    }
    case "divider":
      return <hr className="my-[8px] border-0 border-t border-admin-border" />;
    case "service": {
      const picked = block.offering_id;
      const missing = Boolean(picked) && !offerings.some((o) => o.id === picked);
      return (
        <div className="flex flex-col gap-[8px]">
          {missing ? (
            <p
              role="alert"
              className="m-0 flex items-start gap-[8px] rounded-admin-md bg-admin-accent-soft p-[10px] text-[13px] text-admin-ink"
            >
              <TriangleAlert size={16} className="mt-[1px] shrink-0" />
              {t("dashboard.talentPosts.serviceGone")}
            </p>
          ) : null}
          <ServicePicker
            value={picked ?? null}
            offerings={offerings}
            t={t}
            disabled={disabled}
            emptyOption={null}
            onPick={(id) => onChange({ ...block, offering_id: id ?? undefined })}
          />
        </div>
      );
    }
    case "book_button":
      return (
        <div className="flex flex-col gap-[8px]">
          <input
            className={INPUT}
            maxLength={80}
            disabled={disabled}
            value={block.label ?? ""}
            placeholder={t("dashboard.talentPosts.bookLabelDefault")}
            aria-label={t("dashboard.talentPosts.bookLabel")}
            onChange={(e) => onChange({ ...block, label: e.target.value || undefined })}
          />
          <span className="text-[12px] text-admin-ink-dim">{t("dashboard.talentPosts.bookService")}</span>
          <ServicePicker
            value={block.offering_id ?? null}
            offerings={offerings}
            t={t}
            disabled={disabled}
            emptyOption={t("dashboard.talentPosts.anyService")}
            onPick={(id) => onChange({ ...block, offering_id: id ?? undefined })}
          />
        </div>
      );
    case "faq":
      return (
        <div className="flex flex-col gap-[8px]">
          <input
            className={`${INPUT} font-semibold`}
            maxLength={500}
            disabled={disabled}
            value={block.question ?? ""}
            placeholder={t("dashboard.talentPosts.faqQuestion")}
            onChange={(e) => onChange({ ...block, question: e.target.value })}
          />
          <textarea
            className={`${INPUT} min-h-[96px] resize-y`}
            rows={3}
            maxLength={20000}
            disabled={disabled}
            value={block.answer ?? ""}
            placeholder={t("dashboard.talentPosts.faqAnswer")}
            onChange={(e) => onChange({ ...block, answer: e.target.value })}
          />
        </div>
      );
  }
}

/** Radio-style list of the owner's services. Stores the id only, never a price. */
export function ServicePicker({
  value,
  offerings,
  t,
  disabled,
  emptyOption,
  onPick,
}: {
  value: string | null;
  offerings: readonly WriterOffering[];
  t: PostsT;
  disabled: boolean;
  /** Label of the "no service" choice, or null when a service is required. */
  emptyOption: string | null;
  onPick: (id: string | null) => void;
}) {
  if (offerings.length === 0) {
    return <p className="m-0 text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.noServices")}</p>;
  }
  const row = (selected: boolean) =>
    `flex min-h-11 w-full cursor-pointer items-center justify-between gap-[8px] rounded-admin-md border px-[12px] text-left text-[14px] ${
      selected ? "border-admin-ink bg-admin-surface-alt font-semibold" : "border-admin-border bg-admin-card"
    } text-admin-ink`;
  return (
    <div role="radiogroup" aria-label={t("dashboard.talentPosts.pickService")} className="flex flex-col gap-[6px]">
      {emptyOption ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          disabled={disabled}
          className={row(value === null)}
          onClick={() => onPick(null)}
        >
          {emptyOption}
        </button>
      ) : null}
      {offerings.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          className={row(value === o.id)}
          onClick={() => onPick(o.id)}
        >
          <span className="min-w-0 flex-1 truncate">{o.name}</span>
          {o.priceLabel ? <span className="shrink-0 text-admin-ink-muted">{o.priceLabel}</span> : null}
        </button>
      ))}
    </div>
  );
}
