"use client";

/**
 * CtaDuoEditor — primary + optional-secondary call-to-action editor.
 *
 * Shared by hero, cta_banner, category_grid footer, featured_talent footer.
 * Every surface that carries a CTA pair wants the same shape: primary is
 * always-present (filled look), secondary is opt-in (ghost look). Label is
 * the top-level input; href tucks under an "Advanced" disclosure because
 * most operators want to type "Book a call" and move on, not think about
 * the routing string.
 */

import { useState } from "react";

import { KIT } from "./tokens";
import { LinkKindPicker } from "@/lib/site-admin/sections/shared/LinkKindPicker";
import type { LinkRef } from "@/lib/site-admin/links/link-ref";

export interface CtaShape {
  label: string;
  /** 6C — structured LinkRef or legacy string (schema coerces either). */
  href: LinkRef | string;
}

interface CtaDuoEditorProps {
  primary: CtaShape | null | undefined;
  secondary: CtaShape | null | undefined;
  onChangePrimary: (next: CtaShape | null) => void;
  onChangeSecondary: (next: CtaShape | null) => void;
  /** Whether primary is required by the schema. When true, the delete button hides. */
  primaryRequired?: boolean;
  /** Label for the secondary add button. */
  secondaryAddLabel?: string;
  /**
   * When false, the secondary CTA slot (add button + editor) is completely
   * suppressed. Use this for sections where secondary is not in the schema so
   * operators never see a button that silently discards their input.
   * Defaults to true.
   */
  allowSecondary?: boolean;
  /** Optional DOM role marker for focus delegation from node selection. */
  primaryNodeRole?: string;
  /** Optional DOM role marker for focus delegation from node selection. */
  secondaryNodeRole?: string;
}

export function CtaDuoEditor({
  primary,
  secondary,
  onChangePrimary,
  onChangeSecondary,
  primaryRequired = false,
  secondaryAddLabel = "Add secondary button",
  allowSecondary = true,
  primaryNodeRole,
  secondaryNodeRole,
}: CtaDuoEditorProps) {
  const [showSecondary, setShowSecondary] = useState<boolean>(
    Boolean(secondary),
  );
  const [advancedPrimary, setAdvancedPrimary] = useState<boolean>(
    Boolean(primary?.href && primary.href !== "#"),
  );
  const [advancedSecondary, setAdvancedSecondary] = useState<boolean>(
    Boolean(secondary?.href && secondary.href !== "#"),
  );

  function patchPrimary(patch: Partial<CtaShape>) {
    const next: CtaShape = {
      label: patch.label ?? primary?.label ?? "",
      href: patch.href ?? primary?.href ?? "",
    };
    if (!next.label && !next.href && !primaryRequired) {
      onChangePrimary(null);
      return;
    }
    onChangePrimary(next);
  }

  function patchSecondary(patch: Partial<CtaShape>) {
    const next: CtaShape = {
      label: patch.label ?? secondary?.label ?? "",
      href: patch.href ?? secondary?.href ?? "",
    };
    if (!next.label && !next.href) {
      onChangeSecondary(null);
      return;
    }
    onChangeSecondary(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Primary CTA — filled look */}
      <div
        className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2.5"
        data-hero-node-role={primaryNodeRole}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Primary
          </span>
          <button
            type="button"
            onClick={() => setAdvancedPrimary((v) => !v)}
            className="text-[10px] font-medium text-stone-500 hover:text-stone-700"
          >
            {advancedPrimary ? "Hide link" : "Edit link"}
          </button>
        </div>
        <input
          type="text"
          className={KIT.input}
          placeholder="Button label — e.g. Start a booking"
          value={primary?.label ?? ""}
          maxLength={60}
          onChange={(e) => patchPrimary({ label: e.target.value })}
        />
        {advancedPrimary ? (
          <div className="mt-1.5">
            <LinkKindPicker
              value={primary?.href}
              onChange={(next) => patchPrimary({ href: next })}
            />
          </div>
        ) : null}
      </div>

      {allowSecondary && (showSecondary || secondary) ? (
        <div
          className="rounded-lg border border-dashed border-[#e5e0d5] bg-[#faf9f6]/60 p-2.5"
          data-hero-node-role={secondaryNodeRole}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e0d5] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600">
              Secondary
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdvancedSecondary((v) => !v)}
                className="text-[10px] font-medium text-stone-500 hover:text-stone-700"
              >
                {advancedSecondary ? "Hide link" : "Edit link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSecondary(false);
                  onChangeSecondary(null);
                }}
                className="text-[10px] font-medium text-stone-500 hover:text-rose-600"
                title="Remove secondary button"
              >
                Remove
              </button>
            </div>
          </div>
          <input
            type="text"
            className={KIT.input}
            placeholder="Button label — e.g. Explore services"
            value={secondary?.label ?? ""}
            maxLength={60}
            onChange={(e) => patchSecondary({ label: e.target.value })}
          />
          {advancedSecondary ? (
            <div className="mt-1.5">
              <LinkKindPicker
                value={secondary?.href}
                onChange={(next) => patchSecondary({ href: next })}
              />
            </div>
          ) : null}
        </div>
      ) : allowSecondary ? (
        <button
          type="button"
          onClick={() => setShowSecondary(true)}
          className={`${KIT.ghostButton} w-fit`}
        >
          + {secondaryAddLabel}
        </button>
      ) : null}
    </div>
  );
}
