"use client";

/**
 * Drawer / Display tab — edit the tier's name, tagline, and
 * featured/active flags. Renaming syncs the matching Stripe Product
 * (mutable, single API call).
 */

import { useState, useTransition } from "react";
import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import { updateTierDisplay } from "@/lib/server-actions/admin-product-pricing";
import { HQ, F } from "../_tokens";
import { SectionLabel, Field, Toggle, inputStyle } from "../_primitives";

export function DisplayTab({ tier }: { tier: PricingTierRow }) {
  const [name, setName] = useState(tier.name);
  const [tagline, setTagline] = useState(tier.tagline ?? "");
  const [isFeatured, setIsFeatured] = useState(tier.isFeatured);
  const [isActive, setIsActive] = useState(tier.isActive);
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "error" | "stub"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dirty =
    name !== tier.name ||
    (tagline || null) !== tier.tagline ||
    isFeatured !== tier.isFeatured ||
    isActive !== tier.isActive;

  function save() {
    setState("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateTierDisplay({
        tierId: tier.id,
        name,
        tagline: tagline || null,
        isFeatured,
        isActive,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      setState(res.stripe.stub ? "stub" : "saved");
      setTimeout(() => setState("idle"), 3000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel
        title="Display"
        hint="Renaming the tier syncs the matching Stripe Product (single-call mutation)."
      />

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          style={inputStyle()}
        />
      </Field>
      <Field label="Tagline">
        <input
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={160}
          placeholder="Short subline shown under the price"
          style={inputStyle()}
        />
      </Field>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Toggle
          label="Featured"
          checked={isFeatured}
          onChange={setIsFeatured}
          hint='Adds "Most popular" treatment on marketing.'
        />
        <Toggle
          label="Active"
          checked={isActive}
          onChange={setIsActive}
          hint="Hide entirely from marketing if off."
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 6,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === "saving"}
          style={{
            background: dirty ? HQ.ink : "transparent",
            color: dirty ? HQ.bg : HQ.inkMuted,
            border: dirty ? "none" : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "9px 16px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: !dirty || state === "saving" ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          {state === "saving" ? "Saving…" : "Save display"}
        </button>
        {state === "saved" && (
          <span style={{ fontSize: 11.5, color: HQ.green }}>
            Saved + Stripe synced.
          </span>
        )}
        {state === "stub" && (
          <span style={{ fontSize: 11.5, color: HQ.amber }}>
            Saved in DB — Stripe rename skipped.
          </span>
        )}
        {state === "error" && (
          <span style={{ fontSize: 11.5, color: HQ.red }}>{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
