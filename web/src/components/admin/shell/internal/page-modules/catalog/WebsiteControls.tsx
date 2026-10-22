"use client";

/**
 * WebsiteControls — the Catalog's Status (Draft / Published / Stopped /
 * Archived) and website presence (Own page / In lists only / Not on the site)
 * selects. They write only through the pure patches in
 * `catalog-website-control.ts`; the sellable rule is not touched here.
 */

import { useT } from "@/i18n/use-t";
import type { TabProps } from "./CatalogItemEditor";
import { publishBlockers } from "./catalog-model";
import {
  presenceChoiceOf,
  presencePatch,
  statusChoiceOf,
  statusPatch,
  type PresenceChoice,
  type StatusChoice,
} from "./catalog-website-control";
import { Field, SELECT, SelectShell } from "./catalog-ui";

const STATUSES: readonly StatusChoice[] = ["draft", "published", "stopped", "archived"];
const PRESENCES: readonly PresenceChoice[] = ["own_page", "lists_only", "hidden"];

const STATUS_KEY: Record<StatusChoice, string> = {
  draft: "dashboard.catalog.websiteControl.status.draft",
  published: "dashboard.catalog.websiteControl.status.published",
  stopped: "dashboard.catalog.websiteControl.status.stopped",
  archived: "dashboard.catalog.websiteControl.status.archived",
};
const STATUS_HINT_KEY: Record<StatusChoice, string> = {
  draft: "dashboard.catalog.websiteControl.statusHint.draft",
  published: "dashboard.catalog.websiteControl.statusHint.published",
  stopped: "dashboard.catalog.websiteControl.statusHint.stopped",
  archived: "dashboard.catalog.websiteControl.statusHint.archived",
};
const PRESENCE_KEY: Record<PresenceChoice, string> = {
  own_page: "dashboard.catalog.websiteControl.presence.own_page",
  lists_only: "dashboard.catalog.websiteControl.presence.lists_only",
  hidden: "dashboard.catalog.websiteControl.presence.hidden",
};
const PRESENCE_HINT_KEY: Record<PresenceChoice, string> = {
  own_page: "dashboard.catalog.websiteControl.presenceHint.own_page",
  lists_only: "dashboard.catalog.websiteControl.presenceHint.lists_only",
  hidden: "dashboard.catalog.websiteControl.presenceHint.hidden",
};

export function WebsiteControls({ item, patch, saving, isDraft }: Pick<TabProps, "item" | "patch" | "saving" | "isDraft">) {
  const t = useT();
  const status = statusChoiceOf(item);
  const presence = presenceChoiceOf(item);
  // Publishing runs the same checks as the Publish button; an unfinished item cannot be switched on here either.
  const cannotPublish = publishBlockers(item).length > 0;
  return (
    <div className="grid grid-cols-2 gap-[16px] max-[720px]:grid-cols-1" data-testid="catalog-website-controls">
      <Field label={t("dashboard.catalog.websiteControl.statusLabel")} hint={t(STATUS_HINT_KEY[status])}>
        <SelectShell>
          <select
            value={status}
            disabled={saving || isDraft}
            data-testid="catalog-status-select"
            onChange={(e) => patch(statusPatch(item, e.target.value as StatusChoice))}
            className={SELECT}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} disabled={s === "published" && cannotPublish}>
                {t(STATUS_KEY[s])}
              </option>
            ))}
          </select>
        </SelectShell>
      </Field>
      <Field label={t("dashboard.catalog.websiteControl.presenceLabel")} hint={t(PRESENCE_HINT_KEY[presence])}>
        <SelectShell>
          <select
            value={presence}
            disabled={saving}
            data-testid="catalog-presence-select"
            onChange={(e) => patch(presencePatch(item, e.target.value as PresenceChoice))}
            className={SELECT}
          >
            {PRESENCES.map((p) => (
              <option key={p} value={p}>
                {t(PRESENCE_KEY[p])}
              </option>
            ))}
          </select>
        </SelectShell>
      </Field>
    </div>
  );
}
