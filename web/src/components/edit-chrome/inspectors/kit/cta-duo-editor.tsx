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

export interface CtaShape {
  label: string;
  href: string;
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
}

export function CtaDuoEditor({
  primary,
  secondary,
  onChangePrimary,
  onChangeSecondary,
  primaryRequired = false,
  secondaryAddLabel = "Add secondary button",
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
      <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Primary
          </span>
          <button
            type="button"
            onClick={() => setAdvancedPrimary((v) => !v)}
            className="text-[10px] font-medium text-zinc-400 hover:text-zinc-700"
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
          <input
            type="text"
            className={`${KIT.input} mt-1.5 text-[12px]`}
            placeholder="/path or https://…"
            value={primary?.href ?? ""}
            maxLength={500}
            onChange={(e) => patchPrimary({ href: e.target.value })}
          />
        ) : null}
      </div>

      {showSecondary || secondary ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Secondary
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdvancedSecondary((v) => !v)}
                className="text-[10px] font-medium text-zinc-400 hover:text-zinc-700"
              >
                {advancedSecondary ? "Hide link" : "Edit link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSecondary(false);
                  onChangeSecondary(null);
                }}
                className="text-[10px] font-medium text-zinc-400 hover:text-rose-600"
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
            <input
              type="text"
              className={`${KIT.input} mt-1.5 text-[12px]`}
              placeholder="/path or https://…"
              value={secondary?.href ?? ""}
              maxLength={500}
              onChange={(e) => patchSecondary({ href: e.target.value })}
            />
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSecondary(true)}
          className={`${KIT.ghostButton} w-fit`}
        >
          + {secondaryAddLabel}
        </button>
      )}
    </div>
  );
}
