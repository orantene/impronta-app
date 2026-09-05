import "server-only";

import * as React from "react";
import TalentWelcome from "../../../emails/talent/Welcome";
import ClientWelcome from "../../../emails/client/Welcome";
import type { CatalogEntry } from "./types";
import { eventUser, str } from "./catalog-audiences";
import { pageUrl } from "./catalog-render";

/**
 * Account-lifecycle welcome entries, split out of `catalog.ts` to keep that
 * file under the 800-line cap (the same sibling-extraction convention the
 * inquiry / billing / reviews entries already use).
 *
 * Both are platform-scoped (`tenantId: null` → Tulala brand) and resolved by
 * `eventUser`: neither a talent nor a client is tenant-bound at onboarding,
 * and both dashboard links point at the platform host.
 */
/**
 * account.talent_welcome (§12: onboarding/actions.ts) — the freshly-onboarded
 * talent. Platform-scoped (`tenantId: null` → Tulala brand): a talent isn't
 * tenant-bound at onboarding, and the dashboard link points at the platform
 * host. `userId` is the talent, resolved by `eventUser`.
 */
const TALENT_WELCOME_ENTRY: CatalogEntry = {
  id: "account.talent_welcome",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["account.talent_onboarded"],
  resolveAudience: eventUser("talent"),
  email: {
    templateId: "account.talent_welcome",
    subject: (event, recipient) => {
      const full = str(event.payload.talentName) ?? recipient.displayName;
      const first = full?.trim() ? full.split(" ")[0] : null;
      return first ? `Welcome to Tulala, ${first}` : "Welcome to Tulala — your profile is ready";
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(TalentWelcome, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        dashboardUrl: pageUrl(brand, "/talent"),
        brand,
      }),
  },
};

/**
 * account.client_welcome (2026-09-03) — the freshly-onboarded CLIENT.
 *
 * The EN/ES copy for this ("client.welcome") has existed in email-copy since
 * the notification engine shipped, and emails/client/Welcome.tsx renders it —
 * but NO catalog entry ever referenced that templateId, so nothing could
 * dispatch it and no client has ever received a welcome. This entry is the
 * missing half; `completeClientOnboarding` now emits `account.client_onboarded`
 * the same way the talent path emits `account.talent_onboarded`.
 *
 * Platform-scoped (`tenantId: null` → Tulala brand) and `eventUser`-resolved,
 * mirroring TALENT_WELCOME_ENTRY: a client is not tenant-bound at onboarding
 * and the dashboard link points at the platform host.
 */
const CLIENT_WELCOME_ENTRY: CatalogEntry = {
  id: "account.client_welcome",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["account.client_onboarded"],
  resolveAudience: eventUser("client"),
  email: {
    templateId: "client.welcome",
    subject: (event, recipient) => {
      const full = str(event.payload.clientName) ?? recipient.displayName;
      const first = full?.trim() ? full.split(" ")[0] : null;
      return first ? `Welcome to Tulala, ${first}` : "Welcome to Tulala";
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(ClientWelcome, {
        clientName: str(event.payload.clientName) ?? recipient.displayName,
        dashboardUrl: pageUrl(brand, "/client"),
        brand,
      }),
  },
};

/** The account-lifecycle entries, in catalog order. */
export const ACCOUNT_CATALOG_ENTRIES: CatalogEntry[] = [
  TALENT_WELCOME_ENTRY,
  CLIENT_WELCOME_ENTRY,
];
