"use client";

/**
 * ServicesPage — the talent's Services tab (/talent/services).
 *
 * THE one place pricing lives: the storefront catalog of everything a client
 * can book or buy from the talent's public page. Replaces the legacy Rates
 * accordion, the standalone fixed rate, and the Settings-buried services-menu
 * card as the single door to pricing.
 */

import { TalentOfferingsManager } from "@/components/talent/services/TalentOfferingsManager";
import { useAdminShell } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";

export function ServicesPage() {
  const { bridgeTalentSelfProfile } = useAdminShell();

  return (
    <div>
      <PageHeader
        eyebrow="Storefront"
        title="Services"
        subtitle="What clients can book or buy from your page — you choose per service whether they inquire first or reserve instantly."
      />
      {bridgeTalentSelfProfile ? (
        <TalentOfferingsManager talentId={bridgeTalentSelfProfile.id} />
      ) : (
        <div style={{ fontSize: 13, color: "rgba(11,11,13,0.55)", padding: "18px 4px" }}>
          Your services will appear here once your talent profile is set up.
        </div>
      )}
    </div>
  );
}
