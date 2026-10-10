import "server-only";

import * as React from "react";
import TalentDomainBroken from "../../../emails/talent/DomainBroken";
import TalentDomainRenewal from "../../../emails/talent/DomainRenewal";
import type { CatalogEntry } from "./types";
import { invitedTalent, str } from "./catalog-audiences";
import { formatDateLabel, pageUrl } from "./catalog-render";

/**
 * Talent custom-domain health + renewal catalog entries (Wave 1B D4).
 * Split out of catalog.ts to stay under the 800-line cap.
 *
 * Required `workspace_activity`: domain breakage and renewal timing are
 * operational, not marketing opt-outs. D5 billing is out of scope — renewal
 * copy is informational only.
 */

function domainSettingsUrl(brand: Parameters<typeof pageUrl>[0]): string {
  return pageUrl(brand, "/talent/site");
}

const TALENT_DOMAIN_BROKEN: CatalogEntry = {
  id: "talent.domain_broken",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["talent.domain_broken"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Your custom domain needs attention",
    body: (event) => {
      const domain = str(event.payload.domain) ?? "your domain";
      return `${domain} is not reaching your site. Check DNS and HTTPS settings.`;
    },
  },
  email: {
    templateId: "talent.domain_broken",
    subject: (event) => {
      const domain = str(event.payload.domain);
      return domain
        ? `Your domain ${domain} needs attention`
        : "Your custom domain needs attention";
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(TalentDomainBroken, {
        talentName: recipient.displayName,
        domain: str(event.payload.domain) ?? "your domain",
        failureReason: str(event.payload.failureReason),
        settingsUrl: domainSettingsUrl(brand),
        brand,
      }),
  },
};

const TALENT_DOMAIN_RENEWAL: CatalogEntry = {
  id: "talent.domain_renewal_notice",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["talent.domain_renewal_notice"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: (event) => {
      const days = Number(event.payload.days);
      return days === 7
        ? "Domain renews in 7 days"
        : "Domain renews in 30 days";
    },
    body: (event) => {
      const domain = str(event.payload.domain) ?? "your domain";
      const days = Number(event.payload.days) || 30;
      return `${domain} renews in about ${days} days.`;
    },
  },
  email: {
    templateId: "talent.domain_renewal_notice",
    subject: (event) => {
      const domain = str(event.payload.domain);
      const days = Number(event.payload.days) || 30;
      return domain
        ? `${domain} renews in ${days} days`
        : `Your domain renews in ${days} days`;
    },
    render: ({ event, recipient, brand }) => {
      const daysRaw = Number(event.payload.days);
      const days: 30 | 7 = daysRaw === 7 ? 7 : 30;
      return React.createElement(TalentDomainRenewal, {
        talentName: recipient.displayName,
        domain: str(event.payload.domain) ?? "your domain",
        days,
        expiresLabel: formatDateLabel(str(event.payload.expiresAtIso)) ?? null,
        settingsUrl: domainSettingsUrl(brand),
        brand,
      });
    },
  },
};

export const TALENT_DOMAIN_CATALOG_ENTRIES: CatalogEntry[] = [
  TALENT_DOMAIN_BROKEN,
  TALENT_DOMAIN_RENEWAL,
];
