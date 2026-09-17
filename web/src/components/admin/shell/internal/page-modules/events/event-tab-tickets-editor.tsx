"use client";

/**
 * event-tab-tickets-editor — the inline ticket-type editor under a tier row
 * (Tickets & Offers). Edits label / price / admits / max / hidden and, since
 * the owner ask of 2026-09-17, the tier's OWN presentation: featured image,
 * badge, "includes" bullets, description. That presentation is a platform
 * fact of the tier (every tenant, every page that sells it); the builder's
 * per-tier `ticket_picker.tiers[]` stays an optional override on top.
 *
 * NEVER the pool key, so a rename cannot detach a night's seats. The only
 * caller of `updateTier`. Split from `event-tab-tickets.tsx` for the file cap.
 */

import { useState, useTransition } from "react";

import { updateTier, type EventTierRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { MediaField, toMediaValue } from "@/components/edit-chrome/inspectors/kit/media-field";
import { includesLines, TIER_BADGE_MAX, TIER_DESCRIPTION_MAX } from "@/lib/events/tier-presentation";
import { useT } from "@/i18n/use-t";

import { ActionButton, BUTTON_PRIMARY, Outcome } from "../appointments-classes-ui";
import { useAdminShell } from "../../state";
import { Field, INPUT } from "../catalog/catalog-ui";
import { centsFromInput } from "./events-model";

export function TierEditor({ tier, onSaved, onCancel }: { tier: EventTierRow; onSaved: () => void; onCancel: () => void }) {
  const t = useT();
  const { bridgeTenantIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;
  const [label, setLabel] = useState(tier.label);
  const [price, setPrice] = useState((tier.amountCents / 100).toFixed(2));
  const [admits, setAdmits] = useState(String(tier.admitsPerUnit));
  const [max, setMax] = useState(tier.maxPerOrder === null ? "" : String(tier.maxPerOrder));
  const [hidden, setHidden] = useState(tier.isHidden);
  // Presentation (the tier's own). The image travels as media id + URL: the
  // id is what is stored, the URL is what the field shows.
  const [imageMediaId, setImageMediaId] = useState<string | null>(tier.presentation.imageMediaId);
  const [imageUrl, setImageUrl] = useState<string | null>(tier.imageUrl);
  const [badge, setBadge] = useState(tier.presentation.badge ?? "");
  const [includes, setIncludes] = useState(tier.presentation.includes.join("\n"));
  const [description, setDescription] = useState(tier.presentation.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-[8px]"
      data-testid="events-tier-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const amountCents = centsFromInput(price);
        if (amountCents === null) {
          setError(t("dashboard.events.tickets.priceInvalid"));
          return;
        }
        start(async () => {
          const res = await updateTier({
            tierId: tier.id,
            label,
            amountCents,
            admitsPerUnit: Math.max(1, Math.round(Number(admits) || 1)),
            maxPerOrder: max.trim() === "" ? null : Math.max(1, Math.round(Number(max))),
            isHidden: hidden,
            presentation: {
              imageMediaId,
              badge: badge.trim(),
              includes: includesLines(includes),
              description: description.trim(),
            },
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onSaved();
        });
      }}
    >
      <div className="grid grid-cols-[minmax(0,2fr)_110px_110px_110px_auto] items-end gap-[8px]">
        <Field label={t("dashboard.events.tickets.tierName")}>
          <input aria-label="Tier name" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} maxLength={80} className={INPUT} />
        </Field>
        <Field label={t("dashboard.events.tickets.colPrice")}>
          <input aria-label="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <Field label={t("dashboard.events.tickets.admitsPerTicket")}>
          <input aria-label="Admits per ticket" inputMode="numeric" value={admits} onChange={(e) => setAdmits(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <Field label={t("dashboard.events.tickets.perOrder")}>
          <input aria-label="Max per order" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} disabled={busy} className={`${INPUT} font-mono`} />
        </Field>
        <label className="flex h-[36px] items-center gap-[6px] font-admin-body text-[12px] text-admin-ink-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} disabled={busy} /> {t("dashboard.events.tickets.hiddenByLink")}
        </label>
      </div>
      <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.events.tickets.renameHint")}</p>

      <div className="mt-[4px] border-t border-admin-border-soft pt-[10px]" data-testid="events-tier-presentation">
        <div className="mb-[8px] font-admin-body text-[12.5px] font-semibold text-admin-ink">{t("dashboard.events.tiers.presentation.title")}</div>
        <p className="m-0 mb-[10px] font-admin-body text-[11.5px] leading-[1.4] text-admin-ink-muted">{t("dashboard.events.tiers.presentation.intro")}</p>
        <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-[12px] max-[720px]:grid-cols-1">
          <Field label={t("dashboard.events.tiers.presentation.image")} hint={t("dashboard.events.tiers.presentation.imageHint")}>
            {tenantId ? (
              <MediaField
                tenantId={tenantId}
                value={toMediaValue(imageUrl, imageMediaId)}
                onChange={(next) => {
                  setImageUrl(next?.url ?? null);
                  setImageMediaId(next?.mediaId ?? null);
                }}
                emptyLabel={t("dashboard.events.tiers.presentation.imageEmpty")}
                aspect="4/5"
                allowUrlPaste={false}
                pickerTitle={t("dashboard.events.tiers.presentation.image")}
              />
            ) : (
              <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.loading")}</p>
            )}
          </Field>
          <div className="flex min-w-0 flex-col gap-[8px]">
            <Field label={t("dashboard.events.tiers.presentation.badge")} hint={t("dashboard.events.tiers.presentation.badgeHint")}>
              <input aria-label="Badge" value={badge} onChange={(e) => setBadge(e.target.value)} disabled={busy} maxLength={TIER_BADGE_MAX} placeholder={t("dashboard.events.tiers.presentation.badgePlaceholder")} className={INPUT} data-testid="events-tier-badge" />
            </Field>
            <Field label={t("dashboard.events.tiers.presentation.includes")} hint={t("dashboard.events.tiers.presentation.includesHint")}>
              <textarea aria-label="Includes" value={includes} onChange={(e) => setIncludes(e.target.value)} disabled={busy} rows={4} placeholder={t("dashboard.events.tiers.presentation.includesPlaceholder")} className={`${INPUT} h-auto resize-y py-[8px]`} data-testid="events-tier-includes" />
            </Field>
            <Field label={t("dashboard.events.tiers.presentation.description")} hint={t("dashboard.events.tiers.presentation.descriptionHint")}>
              <input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} maxLength={TIER_DESCRIPTION_MAX} placeholder={t("dashboard.events.tiers.presentation.descriptionPlaceholder")} className={INPUT} data-testid="events-tier-description" />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex gap-[8px]">
        <button type="submit" disabled={busy} className={`${BUTTON_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`} data-testid="events-tier-save">
          {busy ? t("dashboard.events.tickets.saving") : t("dashboard.events.tickets.save")}
        </button>
        <ActionButton onClick={onCancel} disabled={busy}>
          {t("dashboard.events.tickets.cancel")}
        </ActionButton>
      </div>
      {error ? <Outcome kind="refused">{error}</Outcome> : null}
    </form>
  );
}
