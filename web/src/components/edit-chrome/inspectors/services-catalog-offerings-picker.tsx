"use client";

/**
 * Live offerings list for services_catalog Content selection / featured pickers.
 * Resolves talent from BuilderMediaScope (same pattern as media picker) and loads
 * via loadTalentOfferingsForEditor — never invents catalog rows.
 */

import { useEffect, useMemo, useState } from "react";

import { useBuilderMediaScope } from "@/components/edit-chrome/builder-media-scope";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import {
  isPublicEligibleOffering,
} from "@/lib/site-admin/builder-node/services-catalog-selection";
import { ServicesCatalogLoadingSkeleton } from "@/lib/site-admin/builder-node/services-catalog-loading";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { KIT } from "./kit/tokens";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; offerings: TalentOffering[] }
  | { status: "error"; message: string }
  | { status: "no_talent" };

export function useServicesCatalogEligibleOfferings(): {
  state: LoadState;
  eligible: TalentOffering[];
  allLoaded: TalentOffering[];
} {
  const { talentProfileId } = useBuilderMediaScope();
  const [state, setState] = useState<LoadState>(
    talentProfileId ? { status: "loading" } : { status: "no_talent" },
  );

  useEffect(() => {
    if (!talentProfileId) {
      setState({ status: "no_talent" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    void loadTalentOfferingsForEditor(talentProfileId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "ready", offerings: result.items });
    });
    return () => {
      alive = false;
    };
  }, [talentProfileId]);

  const allLoaded = state.status === "ready" ? state.offerings : [];
  const eligible = useMemo(
    () => allLoaded.filter(isPublicEligibleOffering),
    [allLoaded],
  );

  return { state, eligible, allLoaded };
}

export function ServicesCatalogOfferingsLoadNotice({ state }: { state: LoadState }) {
  if (state.status === "loading") {
    return <ServicesCatalogLoadingSkeleton locale="en" showPhoto={false} rows={3} />;
  }
  if (state.status === "no_talent") {
    return (
      <p className="text-xs text-black/50">
        Open this page from a talent website editor to pick offerings. Selection still saves; the live
        site filters by the IDs you set.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Couldn&apos;t load offerings ({state.message}). Try again, or manage the catalog in Services.
      </p>
    );
  }
  return null;
}

export function ServicesCatalogSearchField({
  value,
  onChange,
  placeholder = "Search offerings…",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className={KIT.input}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}

export function filterOfferingsByQuery(
  offerings: readonly TalentOffering[],
  query: string,
): TalentOffering[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...offerings];
  return offerings.filter((o) => {
    const hay = `${o.title} ${o.category ?? ""} ${o.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}
