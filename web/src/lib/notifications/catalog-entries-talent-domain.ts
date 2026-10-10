import "server-only";

import type { CatalogEntry } from "./types";
import { invitedTalent, str } from "./catalog-audiences";
import { formatDateLabel } from "./catalog-render";

/**
 * WAVE 1B D6 — talent custom-domain plan grace notices (in-app only).
 * Renewal money is D5; do not add Stripe charges here.
 */

const TALENT_DOMAIN_PLAN_GRACE_STARTED: CatalogEntry = {
  id: "talent.domain.plan_grace_started",
  category: "billing",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["talent.domain.plan_grace_started"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Restore Web Office to keep your domain",
    body: (event) => {
      const domain = str(event.payload.domain);
      const ends = formatDateLabel(str(event.payload.graceEndsAt));
      const host = domain ? ` (${domain})` : "";
      if (ends) {
        return `Your custom domain${host} is paused. Restore Web Office by ${ends} to keep it connected.`;
      }
      return `Your custom domain${host} is paused. Restore Web Office within 30 days to keep it connected.`;
    },
  },
};

const TALENT_DOMAIN_DISPOSITION_OFFER: CatalogEntry = {
  id: "talent.domain.disposition_offer",
  category: "billing",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["talent.domain.disposition_offer"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Transfer your domain or let it expire",
    body: (event) => {
      const domain = str(event.payload.domain) ?? "Your domain";
      return `${domain} is no longer on Web Office. Transfer it out with an auth code, or let it expire. Auto-renew is off so Tulala will not keep paying.`;
    },
  },
};

const TALENT_DOMAIN_DETACHED: CatalogEntry = {
  id: "talent.domain.detached",
  category: "billing",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["talent.domain.detached"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Custom domain disconnected",
    body: (event) => {
      const domain = str(event.payload.domain) ?? "Your custom domain";
      return `${domain} was disconnected after Web Office ended. Restore Web Office and reconnect it to serve your site again.`;
    },
  },
};

export const TALENT_DOMAIN_CATALOG_ENTRIES: CatalogEntry[] = [
  TALENT_DOMAIN_PLAN_GRACE_STARTED,
  TALENT_DOMAIN_DISPOSITION_OFFER,
  TALENT_DOMAIN_DETACHED,
];
