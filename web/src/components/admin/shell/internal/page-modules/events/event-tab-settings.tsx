"use client";

/**
 * event-tab-settings — the Settings tab inside EventDetail.
 *
 * ONLY WHAT THE GUEST TICKET READS. `/ticket/<code>` draws the cover, the
 * doors clock, the venue line and the refund section from these five
 * columns; the checklist at the top says which of them is still missing so
 * a venue finishes the event before a guest opens a half-built ticket.
 *
 * Preset first, advanced hidden: the refund switch is the whole decision; the
 * policy and the close date appear only once it is on. Every write is
 * `saveEventSettings` (tenant-scoped, capability-guarded). No wallet passes:
 * nothing here signs them.
 */

import { useEffect, useState, useTransition } from "react";

import { loadEventSettings, saveEventSettings, type EventListRow, type EventSettingsView } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { REFUND_POLICY_DESCRIPTION_KEYS, REFUND_POLICY_LABEL_KEYS, type RefundPolicyKey } from "@/lib/billing/commercial-terms-types";
import { MediaField, toMediaValue } from "@/components/edit-chrome/inspectors/kit/media-field";
import { useT } from "@/i18n/use-t";

import { ActionButton, Outcome } from "../appointments-classes-ui";
import { useAdminShell } from "../../state";
import { BlockPill, CARD, Field, INPUT, SELECT, SectionHead, SelectShell, Switch } from "../catalog/catalog-ui";

const POLICIES: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

type Draft = {
  coverMediaId: string | null;
  coverUrl: string | null;
  doorsOffsetMinutes: string;
  venueId: string;
  description: string;
  refundsOpen: boolean;
  refundPolicyKey: RefundPolicyKey | "";
  refundsCloseAt: string;
};

/** ISO instant → the `datetime-local` value the input wants (the browser's zone; the venue reads the instant). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function draftFrom(event: EventListRow, view: EventSettingsView | null): Draft {
  return {
    coverMediaId: view?.coverMediaId ?? event.coverMediaId,
    coverUrl: view?.coverUrl ?? null,
    doorsOffsetMinutes: String(event.doorsOffsetMinutes),
    venueId: event.venueId ?? "",
    description: event.description ?? "",
    refundsOpen: event.refundsOpen,
    refundPolicyKey: (POLICIES as string[]).includes(event.refundPolicyKey ?? "") ? (event.refundPolicyKey as RefundPolicyKey) : "",
    refundsCloseAt: toLocalInput(event.refundsCloseAt),
  };
}

export function EventSettingsTab({ event, onChanged }: { event: EventListRow; onChanged: () => void }) {
  const t = useT();
  const { bridgeTenantIdentity } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;
  const [view, setView] = useState<EventSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(event, null));
  const [outcome, setOutcome] = useState<{ kind: "done" | "refused"; text: string } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void loadEventSettings({ eventId: event.id }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(r.error); return; }
      setView(r.view);
      setDraft(draftFrom(event, r.view));
    });
    return () => { alive = false; };
  }, [event]);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const doors = Number(draft.doorsOffsetMinutes);
  const checklist: Array<{ key: string; label: string; ok: boolean }> = [
    { key: "cover", label: t("dashboard.events.settings.cover"), ok: Boolean(draft.coverMediaId) },
    { key: "doors", label: t("dashboard.events.settings.doors"), ok: Number.isFinite(doors) && doors > 0 },
    { key: "venue", label: t("dashboard.events.settings.venue"), ok: draft.venueId !== "" },
    { key: "refunds", label: t("dashboard.events.settings.refunds"), ok: draft.refundPolicyKey !== "" },
    { key: "description", label: t("dashboard.events.settings.description"), ok: draft.description.trim().length > 0 },
  ];
  const missing = checklist.filter((c) => !c.ok).length;

  const save = () => {
    setOutcome(null);
    start(async () => {
      const r = await saveEventSettings({
        eventId: event.id,
        coverMediaId: draft.coverMediaId,
        doorsOffsetMinutes: Number.isFinite(doors) ? Math.round(doors) : -1,
        venueId: draft.venueId || null,
        description: draft.description.trim() || null,
        refundsOpen: draft.refundsOpen,
        refundPolicyKey: draft.refundPolicyKey || null,
        refundsCloseAt: fromLocalInput(draft.refundsCloseAt),
      });
      if (!r.ok) { setOutcome({ kind: "refused", text: r.error }); return; }
      setOutcome({ kind: "done", text: t("dashboard.events.settings.saved") });
      onChanged();
    });
  };

  return (
    <div className="flex max-w-[640px] flex-col gap-[14px]" data-testid="events-panel-settings">
      {/* COMPLETE THIS EVENT: what the ticket still lacks. */}
      <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="events-settings-checklist" data-missing={missing}>
        <SectionHead title={t("dashboard.events.settings.checklist")} intro={missing === 0 ? t("dashboard.events.settings.checklistDone") : t("dashboard.events.settings.checklistIntro")} />
        <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
          {checklist.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-[12px] font-admin-body text-admin-13 text-admin-ink" data-testid={`events-settings-check-${c.key}`} data-ok={c.ok ? "true" : "false"}>
              <span>{c.label}</span>
              <span className="w-[88px] shrink-0">
                <BlockPill tone={c.ok ? "green" : "coral"} className="justify-center" state={c.ok ? "set" : "missing"}>
                  {c.ok ? t("dashboard.events.settings.set") : t("dashboard.events.settings.missing")}
                </BlockPill>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {loadError ? <Outcome kind="refused">{loadError}</Outcome> : null}

      <div className={`${CARD} flex flex-col gap-[14px] p-[16px]`}>
        <Field label={t("dashboard.events.settings.cover")} hint={t("dashboard.events.settings.coverHint")}>
          {tenantId ? (
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(draft.coverUrl, draft.coverMediaId)}
              onChange={(next) => setDraft((d) => ({ ...d, coverUrl: next?.url ?? null, coverMediaId: next?.mediaId ?? null }))}
              emptyLabel={t("dashboard.events.settings.coverEmpty")}
              aspect="16/9"
              allowUrlPaste={false}
              pickerTitle={t("dashboard.events.settings.cover")}
            />
          ) : (
            <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.loading")}</p>
          )}
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[16px] max-[720px]:grid-cols-1">
          <Field label={t("dashboard.events.settings.doors")} hint={t("dashboard.events.settings.doorsHint")}>
            <input
              type="number"
              min={0}
              max={1440}
              step={5}
              inputMode="numeric"
              className={INPUT}
              value={draft.doorsOffsetMinutes}
              onChange={(e) => patch("doorsOffsetMinutes", e.target.value)}
              aria-label={t("dashboard.events.settings.doors")}
              data-testid="events-settings-doors"
            />
          </Field>
          <Field label={t("dashboard.events.settings.venue")} hint={view && view.venues.length === 0 ? t("dashboard.events.settings.venueNone") : null}>
            <SelectShell>
              <select className={SELECT} value={draft.venueId} onChange={(e) => patch("venueId", e.target.value)} aria-label={t("dashboard.events.settings.venue")} data-testid="events-settings-venue">
                <option value="">{t("dashboard.events.settings.venuePick")}</option>
                {(view?.venues ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.city ? `${v.name} · ${v.city}` : v.name}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>
        </div>

        <Field label={t("dashboard.events.settings.description")} hint={t("dashboard.events.settings.descriptionHint")}>
          <textarea
            className={`${INPUT} h-auto min-h-[96px] resize-y py-[8px] leading-[1.45]`}
            value={draft.description}
            onChange={(e) => patch("description", e.target.value)}
            maxLength={4000}
            aria-label={t("dashboard.events.settings.description")}
            data-testid="events-settings-description"
          />
        </Field>
      </div>

      <div className={`${CARD} flex flex-col gap-[12px] p-[16px]`} data-testid="events-settings-refunds">
        <div className="flex items-center justify-between gap-[12px]">
          <div>
            <div className="font-admin-body text-[14px] font-semibold text-admin-ink">{t("dashboard.events.settings.refundsOpen")}</div>
            <p className="m-0 mt-[2px] font-admin-body text-[12.5px] leading-[1.4] text-admin-ink-muted">{t("dashboard.events.settings.refundsOpenHint")}</p>
          </div>
          <Switch on={draft.refundsOpen} onChange={(on) => patch("refundsOpen", on)} label={t("dashboard.events.settings.refundsOpen")} testId="events-settings-refunds-open" />
        </div>
        {draft.refundsOpen ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[16px] max-[720px]:grid-cols-1">
            <Field label={t("dashboard.events.settings.policy")} required hint={draft.refundPolicyKey ? t(REFUND_POLICY_DESCRIPTION_KEYS[draft.refundPolicyKey]) : t("dashboard.events.settings.policyHint")}>
              <SelectShell>
                <select className={SELECT} value={draft.refundPolicyKey} onChange={(e) => patch("refundPolicyKey", e.target.value as Draft["refundPolicyKey"])} aria-label={t("dashboard.events.settings.policy")} data-testid="events-settings-policy">
                  <option value="">{t("dashboard.events.settings.policyPick")}</option>
                  {POLICIES.map((k) => (
                    <option key={k} value={k}>{t(REFUND_POLICY_LABEL_KEYS[k])}</option>
                  ))}
                </select>
              </SelectShell>
            </Field>
            <Field label={t("dashboard.events.settings.closeAt")} hint={t("dashboard.events.settings.closeAtHint")}>
              <input type="datetime-local" className={INPUT} value={draft.refundsCloseAt} onChange={(e) => patch("refundsCloseAt", e.target.value)} aria-label={t("dashboard.events.settings.closeAt")} data-testid="events-settings-close-at" />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-[8px]">
        <ActionButton tone="primary" onClick={save} disabled={busy} testId="events-settings-save">
          {busy ? t("dashboard.events.settings.saving") : t("dashboard.events.settings.save")}
        </ActionButton>
        {outcome ? <Outcome kind={outcome.kind} testId="events-settings-outcome">{outcome.text}</Outcome> : null}
      </div>
    </div>
  );
}
