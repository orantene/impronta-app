"use client";

/**
 * background-media-card.tsx — the Content-tab control for a container's moving
 * background (uploaded video or a YouTube URL).
 *
 * ITS OWN FILE ON PURPOSE. `builder-node-content.tsx` is 4,460 lines and holds
 * an eslint `max-lines` suppression, which means the linter has permanently
 * stopped constraining its size (see `lib/quality/file-size-ratchet.ts` for why
 * that suppression shape is a trap). Adding ~180 lines of control there would
 * be invisible growth; adding one import + one element is not.
 *
 * WHAT THE OPERATOR SEES, AND WHY IN THIS ORDER
 * ─────────────────────────────────────────────
 * Source first (Video / YouTube / None), because it changes what the rest of
 * the card means. Then the source-specific field. Then poster, then the scrim.
 *
 * The scrim slider is not optional polish. Autoplaying footage behind a
 * headline is the single easiest way to publish an unreadable page, and an
 * author who has to go find a separate overlay control usually does not. The
 * default when a background is first attached is 40%, which is dark enough for
 * white text over typical footage and light enough that the video still reads.
 */

import { useCallback } from "react";

import {
  BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR,
  BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS,
  BACKGROUND_SLIDESHOW_MAX_INTERVAL_MS,
  BACKGROUND_SLIDESHOW_MIN_INTERVAL_MS,
  resolveBackgroundMedia,
  type BackgroundMediaProps,
  type BackgroundMediaSource,
} from "@/lib/site-admin/builder-node/background-media";

import { useT } from "@/i18n/use-t";

import { Field, FieldLabel, Segmented, TextInput } from "../kit";
import { InspectorLabelWithInfo } from "./kit/inspector-info-tip";
import { DebouncedRangeInput } from "./kit/debounced-range-input";
import { MediaField, toMediaValue } from "./kit";
import { KIT } from "./kit/tokens";
import { BackgroundSlideshowManager } from "./background-slideshow-manager";

/**
 * Scrim applied the moment a background is attached. See the module doc: an
 * opt-in default of 0 ships unreadable pages, so this opts IN.
 */
const DEFAULT_OVERLAY = 40;

type SourceChoice = "none" | BackgroundMediaSource;

export function BackgroundMediaCard({
  nodeId,
  tenantId,
  value,
  onChange,
}: {
  /** The container this background belongs to — the edit-bridge pin key. */
  nodeId: string;
  tenantId: string;
  value: BackgroundMediaProps | undefined;
  /** `undefined` clears the background entirely (the "None" choice). */
  onChange: (next: BackgroundMediaProps | undefined) => void;
}) {
  const t = useT();
  const source: SourceChoice = value?.source ?? "none";

  const patch = useCallback(
    (next: Partial<BackgroundMediaProps>) => {
      if (!value) return;
      onChange({ ...value, ...next });
    },
    [onChange, value],
  );

  const changeSource = useCallback(
    (nextSource: SourceChoice) => {
      if (nextSource === "none") {
        onChange(undefined);
        return;
      }
      // Switching source keeps the scrim + framing the author already dialled
      // in but NEVER carries the src across: a YouTube URL is not a video file
      // and vice versa, and silently keeping the old one renders a dead frame.
      // The picture list is kept, though — flipping to Video to look at it and
      // back must not throw away eight chosen images.
      onChange({
        source: nextSource,
        src: "",
        overlay: value?.overlay ?? DEFAULT_OVERLAY,
        ...(value?.overlayColor ? { overlayColor: value.overlayColor } : null),
        ...(value?.focalPoint ? { focalPoint: value.focalPoint } : null),
        ...(value?.slides?.length ? { slides: value.slides } : null),
        ...(value?.intervalMs ? { intervalMs: value.intervalMs } : null),
        ...(value?.transition ? { transition: value.transition } : null),
      });
    },
    [onChange, value],
  );

  // The renderer's own resolver, so the warning below can never disagree with
  // what actually paints. A non-empty src that resolves to null is the case
  // worth calling out: the author pasted something and nothing will show.
  const resolved = resolveBackgroundMedia(value);
  const srcSet = Boolean(value?.src && value.src.trim());
  const unresolvable = srcSet && !resolved;

  return (
    <div className="flex flex-col gap-3">
      <Field flush>
        <FieldLabel info="Plays muted and looped behind this block, with a still image for visitors who prefer reduced motion.">
          Background media
        </FieldLabel>
        <Segmented
          fullWidth
          compact
          value={source}
          onChange={(next) => changeSource(next as SourceChoice)}
          options={[
            { value: "none", label: "None" },
            { value: "upload", label: "Video" },
            { value: "youtube", label: "YouTube" },
            { value: "slideshow", label: "Slideshow" },
          ]}
        />
      </Field>

      {source === "upload" ? (
        <div className={KIT.field}>
          <label className={KIT.label}>Video file</label>
          <MediaField
            tenantId={tenantId}
            kind="video"
            value={toMediaValue(value?.src, value?.mediaId)}
            onChange={(next) => {
              // `next === null` is a real Clear signal (MediaField invariant
              // D3), and url + mediaId move together (D1).
              patch({ src: next?.url ?? "", mediaId: next?.mediaId ?? null });
            }}
            emptyLabel="Choose video"
            aspect="16/9"
            pickerTitle="Choose a background video"
          />
        </div>
      ) : null}

      {source === "youtube" ? (
        <Field flush>
          <FieldLabel info="Paste any YouTube link. Watch, share and Shorts URLs all work.">
            YouTube link
          </FieldLabel>
          <TextInput
            value={value?.src ?? ""}
            onChange={(next) => patch({ src: next })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </Field>
      ) : null}

      {source === "slideshow" ? (
        <>
          <div className={KIT.field}>
            <InspectorLabelWithInfo
              label="Images"
              info="They cross-fade in this order. Visitors who prefer reduced motion see the first image only, and the rest load lazily."
              className={KIT.label}
            />
            <BackgroundSlideshowManager
              nodeId={nodeId}
              tenantId={tenantId}
              slides={value?.slides ?? []}
              onChange={(slides) => patch({ slides })}
            />
          </div>

          <Field flush>
            {/* Static prefix + rendered number, matching the overlay slider —
                interpolating the seconds INTO the key would mint a fresh
                untranslatable string on every tick. */}
            <FieldLabel info="How long each image stays before the next one fades in.">
              {t("Seconds per image:")}{" "}
              {Math.round(
                (value?.intervalMs ?? BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS) / 1000,
              )}
            </FieldLabel>
            <DebouncedRangeInput
              min={BACKGROUND_SLIDESHOW_MIN_INTERVAL_MS / 1000}
              max={BACKGROUND_SLIDESHOW_MAX_INTERVAL_MS / 1000}
              step={1}
              value={Math.round(
                (value?.intervalMs ?? BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS) / 1000,
              )}
              onCommit={(next) => patch({ intervalMs: Math.round(next) * 1000 })}
              ariaLabel="Seconds per image"
            />
          </Field>

          <Field flush>
            <FieldLabel>Transition</FieldLabel>
            <Segmented
              fullWidth
              compact
              value={value?.transition ?? "crossfade"}
              onChange={(next) =>
                patch({ transition: next === "cut" ? "cut" : "crossfade" })
              }
              options={[
                { value: "crossfade", label: "Crossfade" },
                // "Hard cut", not "Cut": the bare word already means the
                // CLIPBOARD action in this editor's Spanish catalog
                // ("Cortar"), and a transition named "Cortar" reads as a
                // command, not a style.
                { value: "cut", label: "Hard cut" },
              ]}
            />
          </Field>
        </>
      ) : null}

      {source !== "none" ? (
        <>
          {source === "slideshow" ? null : (
          <div className={KIT.field}>
            <InspectorLabelWithInfo
              label={source === "youtube" ? "Poster image (optional)" : "Poster image"}
              info={
                source === "youtube"
                  ? "Shown before the video starts and instead of it under reduced motion. Falls back to the YouTube thumbnail."
                  : "Shown before the video starts and instead of it under reduced motion."
              }
              className={KIT.label}
            />
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(value?.poster)}
              onChange={(next) => patch({ poster: next?.url ?? undefined })}
              emptyLabel="Choose poster"
              aspect="16/9"
              layout="row"
            />
          </div>
          )}

          <Field flush>
            {/* Static prefix + rendered number, matching cta-banner-content —
                interpolating the number INTO the key would produce a fresh
                untranslatable string ("Overlay darkness: 45%") on every tick. */}
            <FieldLabel info="Darkens the background so headings and body copy stay readable.">
              {t("Overlay darkness:")} {value?.overlay ?? 0}%
            </FieldLabel>
            <DebouncedRangeInput
              min={0}
              max={100}
              step={5}
              value={value?.overlay ?? 0}
              onCommit={(next) => patch({ overlay: next })}
              ariaLabel="Overlay darkness"
            />
          </Field>

          <Field flush>
            <FieldLabel info="Any CSS color, or a theme token like var(--token-color-primary). Defaults to black.">
              Overlay color
            </FieldLabel>
            <TextInput
              value={value?.overlayColor ?? ""}
              onChange={(next) =>
                patch({ overlayColor: next.trim() ? next : undefined })
              }
              placeholder={BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR}
            />
          </Field>

          <Field flush>
            <FieldLabel info="Which part of the frame stays visible when it is cropped. Try center, top, or 50% 20%.">
              Focal point
            </FieldLabel>
            <TextInput
              value={value?.focalPoint ?? ""}
              onChange={(next) =>
                patch({ focalPoint: next.trim() ? next : undefined })
              }
              placeholder="center"
            />
          </Field>

          {unresolvable ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-snug text-rose-700">
              {source === "youtube"
                ? "That is not a YouTube video link, so nothing will play. Copy the URL from the video page or the Share button."
                : "That video link cannot be used. Pick a file from the library, or paste an https URL."}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
