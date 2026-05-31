"use client";

/**
 * Phase 3 — per-instance override editor. Shown in the Style panel when a
 * linked component INSTANCE is selected. Loads the master component, lists its
 * overridable slots (text on heading/paragraph/button, src on image, href on
 * button), and writes overrides keyed by the MASTER child id — so the published
 * page renders this instance's master subtree LIVE with these swaps applied,
 * while staying structurally linked to the master.
 *
 * Note: overrides apply on the PUBLISHED page (live resolution). The editor
 * canvas shows the instance's last-synced copy, so a just-set override previews
 * after publish — mirrored on the panel.
 */

import { useEffect, useRef, useState } from "react";

import {
  listBuilderComponents,
  type BuilderComponentRow,
} from "@/lib/site-admin/edit-mode/builder-components-action";
import {
  collectOverridableSlots,
  type OverridableSlot,
} from "@/lib/site-admin/builder-node/component-instances";
import type {
  BuilderNode,
  BuilderNodeInstanceOverride,
} from "@/lib/site-admin/builder-node/types";
import { useEditContext } from "../edit-context";
import { CHROME } from "../kit/tokens";

const inputStyle = {
  height: 28,
  width: "100%",
  fontSize: 12,
  paddingInline: 8,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  outline: "none",
} as const;

export function InstanceOverridesPanel({
  instanceNodeId,
  componentId,
  overrides,
}: {
  instanceNodeId: string;
  componentId: string;
  overrides: Record<string, BuilderNodeInstanceOverride> | undefined;
}) {
  const { setInstanceOverride } = useEditContext();
  const [slots, setSlots] = useState<ReadonlyArray<OverridableSlot>>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [errored, setErrored] = useState(false);
  // BUG-3 fix: keep keystrokes in a local draft and debounce the DB write so we
  // commit once the user pauses — not on every character.
  const [drafts, setDrafts] = useState<
    Record<string, BuilderNodeInstanceOverride>
  >({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await listBuilderComponents();
      if (cancelled) return;
      if (res.ok) {
        const master = res.components.find(
          (c: BuilderComponentRow) => c.id === componentId,
        );
        if (master) {
          setSlots(collectOverridableSlots(master.subtree as BuilderNode));
          setMissing(false);
          setErrored(false);
        } else {
          setMissing(true);
        }
      } else {
        // BUG-2 fix: surface the load failure instead of silently rendering
        // "no slots" — the master may exist but the request failed.
        setErrored(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [componentId]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of Object.keys(pending)) clearTimeout(pending[id]);
    };
  }, []);

  const dropDraft = (masterId: string) => {
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[masterId];
      return rest;
    });
  };

  const apply = (slot: OverridableSlot, patch: BuilderNodeInstanceOverride) => {
    const base = overrides?.[slot.masterId] ?? {};
    const current = { ...base, ...drafts[slot.masterId] };
    const next = { ...current, ...patch };
    setDrafts((d) => ({ ...d, [slot.masterId]: next }));
    if (timers.current[slot.masterId]) clearTimeout(timers.current[slot.masterId]);
    timers.current[slot.masterId] = setTimeout(() => {
      void setInstanceOverride(
        instanceNodeId,
        slot.masterId,
        JSON.stringify(next),
      );
      dropDraft(slot.masterId);
    }, 400);
  };

  const clear = (slot: OverridableSlot) => {
    if (timers.current[slot.masterId]) clearTimeout(timers.current[slot.masterId]);
    dropDraft(slot.masterId);
    void setInstanceOverride(instanceNodeId, slot.masterId, null);
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-instance-overrides=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      <span
        className="text-[10.5px] font-semibold uppercase tracking-[0.10em]"
        style={{ color: CHROME.muted }}
      >
        Instance content
      </span>
      <p className="text-[10px] leading-snug" style={{ color: CHROME.muted }}>
        Swap text, images, or links for just this instance — structure stays
        linked to the master. Applies on the published page.
      </p>

      {loading ? (
        <span className="text-[11px]" style={{ color: CHROME.muted }}>
          Loading master…
        </span>
      ) : errored ? (
        <span className="text-[11px]" style={{ color: CHROME.rose }}>
          Couldn’t load the master component — overrides are unavailable right
          now. Try reopening this panel.
        </span>
      ) : missing ? (
        <span className="text-[11px]" style={{ color: CHROME.muted }}>
          Master component not found — this instance renders its stored copy.
        </span>
      ) : slots.length === 0 ? (
        <span className="text-[11px]" style={{ color: CHROME.muted }}>
          The master has no text or image slots to override.
        </span>
      ) : (
        slots.map((slot) => {
          const ov = drafts[slot.masterId] ?? overrides?.[slot.masterId];
          const textVal = (slot.field === "text" ? ov?.text : ov?.imageSrc) ?? "";
          const hasOverride = Boolean(ov && (ov.text || ov.imageSrc || ov.href));
          return (
            <div
              key={slot.masterId}
              className="flex flex-col gap-1"
              data-builder-instance-override-slot={slot.masterId}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: CHROME.muted }}>
                  {slot.kind === "image" ? "Image src" : slot.kind === "button" ? "Button label" : "Text"}
                </span>
                {hasOverride ? (
                  <button
                    type="button"
                    className="cursor-pointer text-[10px] font-semibold"
                    style={{ color: CHROME.muted, background: "transparent" }}
                    onClick={() => clear(slot)}
                    title="Reset to master"
                  >
                    ↺ reset
                  </button>
                ) : null}
              </div>
              <input
                type="text"
                style={inputStyle}
                placeholder={slot.defaultValue || "(master default)"}
                value={textVal}
                onChange={(e) =>
                  apply(
                    slot,
                    slot.field === "text"
                      ? { text: e.target.value }
                      : { imageSrc: e.target.value },
                  )
                }
              />
              {slot.supportsHref ? (
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="Link href (master default)"
                  value={ov?.href ?? ""}
                  onChange={(e) => apply(slot, { href: e.target.value })}
                />
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
