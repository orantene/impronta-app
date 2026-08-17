"use client";

/**
 * CarouselSettingsPanel — the slider's Content-panel body.
 *
 * Lifted out of `builder-node-content.tsx` (a 4,500-line god file) rather than
 * rewritten in place: the carousel branch alone was ~420 lines of it, and the
 * ratchet's standing instruction is to extract instead of raising a budget.
 *
 * WHAT CHANGED, AND WHY
 * ─────────────────────
 * Before: seven always-expanded `BuilderNodeSection`s of `Field` + `FieldLabel`
 * + `Segmented` + `Stepper` + `Toggle`, using the parchment `KIT`, in a ~300px
 * column. Spec words on the labels ("Content mode", "Scrim strength",
 * "Autoplay"), a "Size & motion" section the rail variant cannot use, and no
 * grouping the operator could collapse.
 *
 * After: the group recipe in `carousel-groups.ts` (Slides first and open,
 * Advanced last), field-kit primitives only, glyph tiles for every choice that
 * has a look, preset chips carrying their real values with the exact input
 * beside them, and plain-language labels with the spec name demoted to the
 * hint line. Groups collapse and persist per `storageKey`.
 *
 * WHAT DID NOT CHANGE: every prop the old panel could edit is still editable.
 * The regroup moves controls; it removes none. `carousel-groups.test.ts` pins
 * that every schema prop stays reachable from "Find a setting".
 */

import type { ReactNode } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import {
  slidesPerViewPatch,
  type CarouselResponsiveTier,
  type CarouselSlidesPerView,
} from "@/lib/site-admin/builder-node/carousel-slides-per-view";
import { TextInput } from "../../kit";
import { InspectorGroup } from "../kit";
import { useInspectorT } from "../kit/use-inspector-t";
import { ChoiceRow, FieldRow, FIELD_KIT, GlyphTiles } from "../field-kit";
import { CarouselSlideManager } from "../carousel-slide-manager";
import {
  CAROUSEL_GROUP_TITLES,
  carouselGroupsFor,
  firstOpenCarouselGroup,
  CAROUSEL_GROUP_SEARCH_TERMS,
  type CarouselGroupId,
} from "./carousel-groups";
import {
  CAROUSEL_HEIGHT_TILES,
  CAROUSEL_SCRIM_TONE_TILES,
  CAROUSEL_TRANSITION_TILES,
  CAROUSEL_VARIANT_TILES,
  CarouselPresetStepperRow,
  CarouselSwitchRow,
  SlidesPerViewRows,
} from "./carousel-controls";

type CarouselNode = Extract<BuilderNode, { kind: "carousel" }>;

export interface CarouselSettingsPanelProps {
  node: CarouselNode;
  commitPatch: (patch: Record<string, unknown>) => void | Promise<void>;
  selectBuilderNode: (nodeId: string) => void;
  commitInsert: (kind: "image" | "card", index: number) => void | Promise<void>;
  commitDuplicate: (nodeId: string) => void | Promise<void>;
  commitRemove: (nodeId: string) => void | Promise<void>;
  commitMoveToIndex: (
    nodeId: string,
    parentId: string,
    toIndex: number,
  ) => void | Promise<void>;
}

/** Rotation speeds an operator actually reaches for, with their real values. */
const ROTATE_PRESETS = [
  { value: 3000, label: "Brisk", caption: "3s" },
  { value: 5200, label: "Easy", caption: "5.2s" },
  { value: 8000, label: "Slow", caption: "8s" },
] as const;

const TRANSITION_SPEED_PRESETS = [
  { value: 600, label: "Quick", caption: "0.6s" },
  { value: 1600, label: "Soft", caption: "1.6s" },
  { value: 2800, label: "Languid", caption: "2.8s" },
] as const;

/**
 * One group from the recipe, or nothing when this variant does not get it.
 *
 * A TOP-LEVEL component, not a closure inside the panel: a component declared
 * in a render body is a new type on every render, so React unmounts and
 * remounts its whole subtree — which would blow away the caret in the shared
 * content text fields on every keystroke.
 */
function CarouselGroup({
  variant,
  group,
  children,
}: {
  variant: "rail" | "hero";
  group: CarouselGroupId;
  children: ReactNode;
}) {
  if (!carouselGroupsFor(variant).includes(group)) return null;
  return (
    <InspectorGroup
      title={CAROUSEL_GROUP_TITLES[group]}
      collapsible
      advanced={group === "advanced"}
      storageKey={`carousel:${group}`}
      defaultOpen={group === firstOpenCarouselGroup()}
      searchTerms={CAROUSEL_GROUP_SEARCH_TERMS[group]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: FIELD_KIT.gap.row }}>
        {children}
      </div>
    </InspectorGroup>
  );
}

export function CarouselSettingsPanel({
  node,
  commitPatch,
  selectBuilderNode,
  commitInsert,
  commitDuplicate,
  commitRemove,
  commitMoveToIndex,
}: CarouselSettingsPanelProps) {
  const { t } = useInspectorT();
  const p = node.props;
  const variant = p.variant ?? "rail";
  const isHero = variant === "hero";
  const overlay = p.overlay ?? {};
  const controls = p.controls ?? {};
  const sc = p.sharedContent ?? {};
  const align = p.contentAlign ?? "bl";
  const vAlign = align.charAt(0) as "t" | "c" | "b";
  const hAlign = align.charAt(1) as "l" | "c" | "r";
  const heightMode = p.heightMode ?? "viewport";
  const contentMode = p.contentMode ?? "per-slide";
  const rotating = Boolean(p.autoplayMs);

  const patchOverlay = (next: Record<string, unknown>) =>
    void commitPatch({ overlay: { ...overlay, ...next } });
  const patchControls = (next: Record<string, unknown>) =>
    void commitPatch({ controls: { ...controls, ...next } });
  const patchShared = (next: Record<string, unknown>) =>
    void commitPatch({ sharedContent: { ...sc, ...next } });

  function setSlidesPerView(
    tier: CarouselResponsiveTier | null,
    next: CarouselSlidesPerView,
  ) {
    if (tier === null) {
      void commitPatch({ slidesPerView: next });
      return;
    }
    void commitPatch(slidesPerViewPatch(p, tier, next));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: FIELD_KIT.gap.row }}>
      {/* SLIDES — first, open, and the only group that edits CONTENT rather
       *  than configuration. Reaching slide 3 was the original bug. */}
      <CarouselGroup variant={variant} group="slides">
        <CarouselSlideManager
          nodeId={node.id}
          slides={node.children}
          onSelect={selectBuilderNode}
          onAdd={() =>
            // A hero slide IS its background image (the renderer lifts an
            // `image` child onto the Ken-Burns layer); a rail slide is a card
            // the operator fills in. Both are in the carousel's allow-list.
            commitInsert(isHero ? "image" : "card", node.children.length)
          }
          onDuplicate={commitDuplicate}
          onRemove={commitRemove}
          onMoveToIndex={(slideId, toIndex) =>
            commitMoveToIndex(slideId, node.id, toIndex)
          }
        />
      </CarouselGroup>

      <CarouselGroup variant={variant} group="layout">
        <GlyphTiles
          label="Layout"
          hint={t(
            "Rail scrolls a row of cards. Hero fills the screen with one image at a time.",
          )}
          searchTerms={["Layout", "variant", "rail", "hero"]}
          columns={2}
          options={CAROUSEL_VARIANT_TILES}
          value={variant}
          onChange={(next) => void commitPatch({ variant: next })}
        />

        {!isHero ? (
          <>
            <FieldRow
              label="Slides visible"
              orientation="stacked"
              hint={t("How many cards fit at once. Set each screen size separately.")}
              searchTerms={[
                "Slides visible",
                "slides per view",
                "slidesPerView",
                "responsive",
                "tablet",
                "mobile",
              ]}
            >
              <SlidesPerViewRows
                props={p}
                onSet={setSlidesPerView}
                onReset={(tier) => void commitPatch(slidesPerViewPatch(p, tier, undefined))}
              />
            </FieldRow>
            <CarouselSwitchRow
              label="Show arrows"
              hint={t("Previous and next controls above the row.")}
              searchTerms={["Show arrows", "showArrows", "next", "previous"]}
              on={p.showArrows ?? false}
              onChange={(next) => void commitPatch({ showArrows: next })}
            />
            <CarouselSwitchRow
              label="Show dots"
              hint={t("One dot per slide, under the row.")}
              searchTerms={["Show dots", "showDots", "pagination"]}
              on={p.showDots ?? false}
              onChange={(next) => void commitPatch({ showDots: next })}
            />
          </>
        ) : (
          <>
            <GlyphTiles
              label="Height"
              hint={t("How much of the screen one slide fills.")}
              searchTerms={["Height", "heightMode", "viewport", "tall"]}
              columns={4}
              options={CAROUSEL_HEIGHT_TILES}
              value={heightMode}
              onChange={(next) => void commitPatch({ heightMode: next })}
            />
            {heightMode === "fixed" ? (
              <CarouselPresetStepperRow
                label="Exact height"
                hint={t("Used when Height is set to Exact.")}
                searchTerms={["Exact height", "min height", "minHeightPx"]}
                presets={[
                  { value: 420, label: "Short", caption: "420px" },
                  { value: 620, label: "Tall", caption: "620px" },
                  { value: 820, label: "Taller", caption: "820px" },
                ]}
                value={p.minHeightPx ?? 620}
                min={120}
                max={2000}
                step={20}
                unit="px"
                onChange={(next) => void commitPatch({ minHeightPx: next })}
              />
            ) : null}
            <ChoiceRow
              label="Content down the slide"
              hint={t("Where the words sit vertically.")}
              searchTerms={["Content placement", "contentAlign", "vertical"]}
              value={vAlign}
              onChange={(next) => void commitPatch({ contentAlign: `${next}${hAlign}` })}
              options={[
                { value: "t", label: "Top" },
                { value: "c", label: "Middle" },
                { value: "b", label: "Bottom" },
              ]}
            />
            <ChoiceRow
              label="Content across the slide"
              hint={t("Where the words sit horizontally.")}
              searchTerms={["Content placement", "contentAlign", "horizontal"]}
              value={hAlign}
              onChange={(next) => void commitPatch({ contentAlign: `${vAlign}${next}` })}
              options={[
                { value: "l", label: "Left" },
                { value: "c", label: "Center" },
                { value: "r", label: "Right" },
              ]}
            />
          </>
        )}
      </CarouselGroup>

      <CarouselGroup variant={variant} group="motion">
        <CarouselSwitchRow
          label="Rotate on its own"
          hint={t("Paused while you edit, so a slide cannot move out from under you.")}
          searchTerms={["Rotate", "autoplay", "autoplayMs"]}
          on={rotating}
          onChange={(next) =>
            void commitPatch({ autoplayMs: next ? (p.autoplayMs ?? 5200) : undefined })
          }
        />
        {rotating ? (
          <CarouselPresetStepperRow
            label="Rotate every"
            hint={t("Time each slide stays on screen.")}
            searchTerms={["Rotate every", "interval", "autoplayMs", "speed"]}
            presets={ROTATE_PRESETS}
            value={p.autoplayMs ?? 5200}
            min={1000}
            max={30000}
            step={200}
            unit="ms"
            onChange={(next) => void commitPatch({ autoplayMs: next })}
          />
        ) : null}
        <CarouselSwitchRow
          label="Loop back to the first slide"
          hint={t("Off means the slider stops on the last slide.")}
          searchTerms={["Loop", "wrap", "repeat"]}
          on={p.loop ?? true}
          onChange={(next) => void commitPatch({ loop: next })}
        />
        <CarouselSwitchRow
          label="Pause when hovered"
          hint={t("Stops rotating while a visitor's pointer is over the slider.")}
          searchTerms={["Pause when hovered", "pauseOnHover"]}
          on={p.pauseOnHover ?? false}
          onChange={(next) => void commitPatch({ pauseOnHover: next })}
        />
        <GlyphTiles
          label="Change slides by"
          hint={t("Fade dissolves one photo into the next. Slide pushes it across.")}
          searchTerms={["Transition", "crossfade", "slide"]}
          columns={2}
          options={CAROUSEL_TRANSITION_TILES}
          value={p.transition ?? "crossfade"}
          onChange={(next) => void commitPatch({ transition: next })}
        />
        <CarouselPresetStepperRow
          label="Change takes"
          hint={t("How long one slide takes to become the next.")}
          searchTerms={["Transition speed", "transitionMs", "duration"]}
          presets={TRANSITION_SPEED_PRESETS}
          value={p.transitionMs ?? 1600}
          min={150}
          max={4000}
          step={100}
          unit="ms"
          onChange={(next) => void commitPatch({ transitionMs: next })}
        />
        <CarouselSwitchRow
          label="Slow zoom on the photo"
          hint={t("The Ken Burns effect: the active photo drifts in slowly.")}
          searchTerms={["Ken Burns zoom", "kenBurns", "zoom", "pan"]}
          on={p.kenBurns ?? true}
          onChange={(next) => void commitPatch({ kenBurns: next })}
        />
        {(p.kenBurns ?? true) ? (
          <CarouselPresetStepperRow
            label="Zoom amount"
            hint={t("How far the photo drifts in over one slide.")}
            searchTerms={["Zoom amount", "kenBurnsAmount"]}
            presets={[
              { value: 5, label: "Subtle", caption: "5%" },
              { value: 10, label: "Normal", caption: "10%" },
              { value: 20, label: "Strong", caption: "20%" },
            ]}
            value={Math.round((p.kenBurnsAmount ?? 0.1) * 100)}
            min={0}
            max={40}
            step={1}
            unit="%"
            onChange={(next) => void commitPatch({ kenBurnsAmount: next / 100 })}
          />
        ) : null}
      </CarouselGroup>

      <CarouselGroup variant={variant} group="look">
        <CarouselSwitchRow
          label="Darken behind the words"
          hint={t("The legibility scrim. Keeps text readable over a bright photo.")}
          searchTerms={["Scrim", "overlay", "legibility", "darken"]}
          on={overlay.scrim !== false}
          onChange={(next) => patchOverlay({ scrim: next })}
        />
        <GlyphTiles
          label="Wash colour"
          hint={t("Dark for light photos, light for dark ones.")}
          searchTerms={["Scrim tone", "overlay tone", "dark", "light"]}
          columns={2}
          options={CAROUSEL_SCRIM_TONE_TILES}
          value={overlay.tone ?? "dark"}
          onChange={(next) => patchOverlay({ tone: next })}
          disabled={overlay.scrim === false}
        />
        <CarouselPresetStepperRow
          label="Wash strength"
          hint={t("How heavy the wash is over the photo.")}
          searchTerms={["Scrim strength", "overlay opacity"]}
          presets={[
            { value: 40, label: "Light", caption: "40%" },
            { value: 70, label: "Medium", caption: "70%" },
            { value: 100, label: "Full", caption: "100%" },
          ]}
          value={Math.round((overlay.opacity ?? 1) * 100)}
          min={0}
          max={100}
          step={5}
          unit="%"
          disabled={overlay.scrim === false}
          onChange={(next) => patchOverlay({ opacity: next / 100 })}
        />
        <CarouselSwitchRow
          label="Darken the corners"
          hint={t("The vignette. Pulls the eye to the middle of the photo.")}
          searchTerms={["Vignette", "corners"]}
          on={overlay.vignette !== false}
          onChange={(next) => patchOverlay({ vignette: next })}
        />
        <CarouselSwitchRow
          label="Film grain"
          hint={t("A fine noise texture over the whole slide.")}
          searchTerms={["Film grain", "grain", "texture", "noise"]}
          on={p.grain !== false}
          onChange={(next) => void commitPatch({ grain: next })}
        />
        <CarouselSwitchRow
          label="Dots"
          hint={t("One dot per slide, tappable.")}
          searchTerms={["Dots", "controls dots", "pagination"]}
          on={controls.dots ?? true}
          onChange={(next) => patchControls({ dots: next })}
        />
        <CarouselSwitchRow
          label="Arrows"
          hint={t("Previous and next controls on the slide.")}
          searchTerms={["Arrows", "controls arrows"]}
          on={controls.arrows ?? false}
          onChange={(next) => patchControls({ arrows: next })}
        />
        <CarouselSwitchRow
          label="Slide counter"
          hint={t("Shows 01 / 05 beside the dots.")}
          searchTerms={["Counter", "controls counter"]}
          on={controls.counter ?? true}
          onChange={(next) => patchControls({ counter: next })}
        />
        <CarouselSwitchRow
          label="Progress bar"
          hint={t("A thin bar filling as the slides advance.")}
          searchTerms={["Progress bar", "controls progress"]}
          on={controls.progress ?? false}
          onChange={(next) => patchControls({ progress: next })}
        />
        <CarouselSwitchRow
          label="Scroll cue"
          hint={t("The small hint that there is more page below.")}
          searchTerms={["Scroll cue", "controls scrollCue"]}
          on={controls.scrollCue ?? true}
          onChange={(next) => patchControls({ scrollCue: next })}
        />
      </CarouselGroup>

      <CarouselGroup variant={variant} group="advanced">
        {isHero ? (
          <>
            <ChoiceRow
              label="Words on the slides"
              hint={t(
                "Per slide gives each slide its own words. One block keeps the words still while the photos change.",
              )}
              searchTerms={["Content mode", "contentMode", "shared"]}
              value={contentMode}
              onChange={(next) => void commitPatch({ contentMode: next })}
              options={[
                { value: "per-slide", label: "Per slide" },
                { value: "shared", label: "One block" },
              ]}
            />
            {contentMode === "shared" ? (
              <>
                <SharedTextRow
                  label="Eyebrow"
                  placeholder="Talent Agency"
                  value={sc.eyebrow ?? ""}
                  onChange={(value) => patchShared({ eyebrow: value })}
                />
                <SharedTextRow
                  label="Heading"
                  placeholder="Faces with an"
                  value={sc.headingLead ?? ""}
                  onChange={(value) => patchShared({ headingLead: value })}
                />
                <SharedTextRow
                  label="Accent word"
                  hint={t("Rendered in the theme's accent, after the heading.")}
                  placeholder="imprint."
                  value={sc.headingAccent ?? ""}
                  onChange={(value) => patchShared({ headingAccent: value })}
                />
                <SharedTextRow
                  label="Subtext"
                  placeholder="One supporting line."
                  value={sc.sub ?? ""}
                  onChange={(value) => patchShared({ sub: value })}
                />
                <SharedTextRow
                  label="Main button"
                  placeholder="Explore the roster"
                  value={sc.primaryCta?.label ?? ""}
                  onChange={(value) =>
                    patchShared({ primaryCta: { ...(sc.primaryCta ?? {}), label: value } })
                  }
                />
                <SharedTextRow
                  label="Main button link"
                  placeholder="/roster"
                  value={sc.primaryCta?.href ?? ""}
                  onChange={(value) =>
                    patchShared({ primaryCta: { ...(sc.primaryCta ?? {}), href: value } })
                  }
                />
                <SharedTextRow
                  label="Second button"
                  placeholder="Start an inquiry"
                  value={sc.secondaryCta?.label ?? ""}
                  onChange={(value) =>
                    patchShared({ secondaryCta: { ...(sc.secondaryCta ?? {}), label: value } })
                  }
                />
                <SharedTextRow
                  label="Second button link"
                  placeholder="/contact"
                  value={sc.secondaryCta?.href ?? ""}
                  onChange={(value) =>
                    patchShared({ secondaryCta: { ...(sc.secondaryCta ?? {}), href: value } })
                  }
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            {/* The rail scrolls; it has no rotation of its own. These are
             *  stored on the same node, so they are shown here rather than
             *  hidden, with the condition stated instead of implied. */}
            <CarouselSwitchRow
              label="Loop back to the first slide"
              hint={t("Takes effect when the layout is set to Hero.")}
              searchTerms={["Loop", "wrap", "repeat"]}
              on={p.loop ?? false}
              onChange={(next) => void commitPatch({ loop: next })}
            />
            <CarouselPresetStepperRow
              label="Rotate every"
              hint={t("Takes effect when the layout is set to Hero.")}
              searchTerms={["Rotate every", "autoplay", "autoplayMs", "interval"]}
              presets={ROTATE_PRESETS}
              value={p.autoplayMs ?? 5200}
              min={1000}
              max={30000}
              step={200}
              unit="ms"
              onChange={(next) => void commitPatch({ autoplayMs: next })}
            />
          </>
        )}
      </CarouselGroup>
    </div>
  );
}

function SharedTextRow({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <FieldRow label={label} hint={hint} orientation="stacked" searchTerms={[label, "shared content"]}>
      <TextInput value={value} onChange={onChange} placeholder={placeholder} />
    </FieldRow>
  );
}
