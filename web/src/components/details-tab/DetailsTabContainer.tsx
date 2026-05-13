"use client";

/**
 * DetailsTabContainer — client-side data wrapper around the canonical
 * <DetailsTab> component.
 *
 * Loads DetailsTabData from `loadDetailsTabData` on mount + when
 * inquiryId/pov change. Renders a thin skeleton while pending, an
 * empty message on load failure, and the full DetailsTab on success.
 *
 * Used by the admin / talent / client message shells to render the
 * "Details" tab. v3 plan §10.
 */

import { useEffect, useState } from "react";
import { DetailsTab, type DetailsTabData, type DetailsTabPov } from "./DetailsTab";
import { loadDetailsTabData } from "@/lib/server-actions/details-tab-data";

export function DetailsTabContainer({
  inquiryId,
  pov,
}: {
  inquiryId: string;
  pov: DetailsTabPov;
}) {
  const [data, setData] = useState<DetailsTabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    loadDetailsTabData(inquiryId, pov)
      .then((d) => {
        if (cancelled) return;
        if (!d) { setErrored(true); setData(null); }
        else { setData(d); }
      })
      .catch(() => { if (!cancelled) setErrored(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [inquiryId, pov]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "rgba(11,11,13,0.55)", fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13 }}>
        Loading details…
      </div>
    );
  }
  if (errored || !data) {
    return (
      <div style={{ padding: 24, color: "rgba(11,11,13,0.55)", fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13 }}>
        Could not load details for this inquiry.
      </div>
    );
  }
  return <DetailsTab pov={pov} data={data} />;
}
