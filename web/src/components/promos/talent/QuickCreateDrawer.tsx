"use client";

import { useMemo, useState, type ReactNode } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useOpenUpgradeModal } from "@/components/admin/shell/internal/state/upgrade-bridge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { createPromo, updatePromo, type PromosPageData } from "@/lib/promos/actions";
import type { PromoCopy, PromoCopyKey } from "@/lib/promos/copy/talent";
import { classifyEdit } from "@/lib/promos/safe-edit";
import { formatMoney } from "@/lib/promos/talent-view";
import {
  dateChipRange, earnEstimate, previewQuote, promoNudges, todayLocal, validateDraft,
  type DateChip, type DraftError, type PromoDraft, type PreviewService,
} from "@/lib/promos/templates";
import type { Audience, OfferKind, Unlock } from "@/lib/promos/types";
import { PromoPreview } from "./PromoPreview";
import { Chip, InfoTip, UI } from "./ui";

const PCT_CHIPS = [10, 15, 20, 30] as const;
const SPOT_CHIPS = [3, 5, 10] as const;
const AUDIENCES: readonly Audience[] = ["public", "new_clients", "returning", "lapsed"];
const UNLOCKS: readonly Unlock[] = ["auto", "code", "link"];
const OFFERS: readonly OfferKind[] = ["percent", "fixed", "fixed_price"];

type Props = {
  open: boolean;
  onClose: () => void;
  copy: PromoCopy;
  data: PromosPageData;
  /** Template defaults for a new promo, or the stored draft when editing. */
  initial: PromoDraft;
  editingId: string | null;
  usedCount: number;
  onSaved: () => void;
};

function errKey(e: DraftError): PromoCopyKey {
  return `err.${e}` as PromoCopyKey;
}

export function QuickCreateDrawer({ open, onClose, copy, data, initial, editingId, usedCount, onSaved }: Props) {
  const { toast } = useAdminShell();
  const openUpgrade = useOpenUpgradeModal();
  const [draft, setDraft] = useState<PromoDraft>(initial);
  const [serviceId, setServiceId] = useState<string | null>(initial.target_ids[0] ?? data.services[0]?.id ?? null);
  const [showMore, setShowMore] = useState(false);
  const [pickDates, setPickDates] = useState(false);
  const [otherPct, setOtherPct] = useState(false);
  const [pickServices, setPickServices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<DraftError[]>([]);
  const [serverError, setServerError] = useState<PromoCopyKey | null>(null);

  const set = (patch: Partial<PromoDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const today = todayLocal(data.nowIso, draft.tz);
  const locked = editingId !== null && usedCount > 0;

  const service: PreviewService | null = useMemo(() => {
    const s = data.services.find((x) => x.id === serviceId) ?? data.services[0] ?? null;
    return s ? { id: s.id, title: s.title, list_cents: s.list_cents } : null;
  }, [data.services, serviceId]);

  const result = useMemo(() => (service ? previewQuote(draft, service, data.nowIso) : null), [draft, service, data.nowIso]);
  const earn = useMemo(() => (service ? earnEstimate(draft, service, data.nowIso) : null), [draft, service, data.nowIso]);
  const nudges = useMemo(
    () =>
      promoNudges(
        draft,
        data.promos.map((p) => ({ id: p.id, name: p.name, status: p.status, promo: p.promo })),
        service?.list_cents ?? 0,
      ),
    [draft, data.promos, service],
  );
  const verdict = useMemo(
    () => (editingId ? classifyEdit(initial, draft, usedCount) : null),
    [editingId, initial, draft, usedCount],
  );
  const addon = data.addons.find((a) => a.id === draft.addon_id) ?? null;
  const money = (c: number) => formatMoney(c, draft.currency, copy.locale);

  const chooseDates = (chip: DateChip) => {
    const r = dateChipRange(chip, today);
    set({ starts_at: r.start, ends_at: r.end });
    setPickDates(false);
  };
  const toggleDay = (d: number) =>
    set({ weekdays: draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d] });
  const toggleService = (id: string) =>
    set({ target_ids: draft.target_ids.includes(id) ? draft.target_ids.filter((x) => x !== id) : [...draft.target_ids, id] });

  const scheduled = Boolean(draft.starts_at && draft.starts_at > today);

  async function submit(mode: "draft" | "live") {
    const found = validateDraft(draft);
    setErrors(found);
    setServerError(null);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const res = editingId ? await updatePromo(editingId, draft) : await createPromo({ draft, mode });
      if (res.ok) {
        toast(copy.t(editingId ? "toast.saved" : mode === "draft" ? "toast.draft" : scheduled ? "toast.scheduled" : "toast.live"));
        onSaved();
        onClose();
        return;
      }
      if ("needsUpgrade" in res) {
        toast(copy.t("upgrade.saved"));
        openUpgrade({
          feature: copy.t("upgrade.feature"),
          why: copy.t("upgrade.why"),
          requiredPlan: "website",
        });
        onSaved();
        onClose();
        return;
      }
      if (res.fields && res.fields.length > 0) setErrors(res.fields);
      const errKeyFor: PromoCopyKey = res.error === "code_taken" ? "err.code_taken" : res.error === "not_allowed" ? "err.not_allowed" : res.error === "not_found" ? "err.not_found" : res.error === "invalid" ? "err.invalid" : "err.unavailable";
      // The inline alert sits below the fold on a phone; say it where the eye is too.
      toast(copy.t(errKeyFor));
      setServerError(errKeyFor);
    } catch {
      toast(copy.t("toast.error"));
      setServerError("toast.error");
    } finally {
      setBusy(false);
    }
  }

  const isMoney = draft.offer_kind === "fixed" || draft.offer_kind === "fixed_price";
  const title = editingId ? copy.t("create.edit_title") : copy.t(`tpl.${draft.template}` as PromoCopyKey);

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        className="flex max-h-[94vh] max-w-full flex-col gap-0 overflow-x-hidden rounded-t-3xl bg-[var(--tc-canvas,#fafafa)] p-0 text-[var(--tc-ink,#1c1c1e)]"
        aria-describedby={undefined}
      >
        <div className="px-4 pb-2 pt-4">
          <SheetTitle className={UI.title}>{title}</SheetTitle>
          <SheetDescription className="sr-only">{copy.t("picker.sub")}</SheetDescription>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-4 pb-4">
          {data.plan === "free" && !data.trialUsed ? (
            <p className={`flex items-center justify-between rounded-xl bg-[var(--tc-soft,#e6f4f1)] pl-3 text-[13px] font-medium ${UI.ink}`}>
              {copy.t("free.banner")}
              <InfoTip text={copy.t("free.info")} label={copy.t("info.label")} />
            </p>
          ) : null}

          <div className={`${UI.card} flex flex-col gap-4 p-4`}>
            {/* Discount */}
            {draft.offer_kind === "free_addon" ? (
              <Field label={copy.t("create.addon")}>
                {data.addons.length === 0 ? (
                  <p className={`text-[13px] ${UI.muted}`}>{copy.t("create.no_addon")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.addons.map((a) => (
                      <Chip key={a.id} active={draft.addon_id === a.id} onClick={() => set({ addon_id: a.id, addon_list_cents: a.list_cents })}>
                        {a.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </Field>
            ) : (
              <Field label={draft.offer_kind === "fixed_price" ? copy.t("create.price") : isMoney ? copy.t("create.amount") : copy.t("create.discount")}>
                {isMoney ? (
                  <NumberBox
                    label={copy.t("create.amount")}
                    value={Math.round(draft.value / 100)}
                    min={1}
                    onChange={(n) => set({ value: n * 100 })}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {PCT_CHIPS.map((n) => (
                      <Chip key={n} active={draft.value === n && !otherPct} onClick={() => { setOtherPct(false); set({ value: n }); }}>
                        {n}%
                      </Chip>
                    ))}
                    <Chip active={otherPct || !(PCT_CHIPS as readonly number[]).includes(draft.value)} onClick={() => setOtherPct(true)}>
                      {copy.t("pct.other")}
                    </Chip>
                    {otherPct || !(PCT_CHIPS as readonly number[]).includes(draft.value) ? (
                      <NumberBox label="%" value={draft.value} min={1} max={90} onChange={(n) => set({ value: n })} suffix="%" />
                    ) : null}
                  </div>
                )}
              </Field>
            )}

            {/* On */}
            <Field label={copy.t("create.on")}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip active={draft.target_ids.length === 0} onClick={() => set({ target_ids: [] })}>
                  {copy.t("create.services_all")}
                </Chip>
                {data.services.length > 0 ? (
                  <Chip active={draft.target_ids.length > 0} onClick={() => setPickServices((v) => !v)}>
                    {draft.target_ids.length > 0 ? copy.t("create.services_n", { n: draft.target_ids.length }) : copy.t("create.services_pick")}
                  </Chip>
                ) : (
                  <span className={`text-[12px] ${UI.muted}`}>{copy.t("create.no_services")}</span>
                )}
              </div>
              {pickServices ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {data.services.map((s) => (
                    <li key={s.id}>
                      <label className="flex min-h-11 items-center gap-3 text-[14px]">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={draft.target_ids.includes(s.id)}
                          onChange={() => { toggleService(s.id); setServiceId(s.id); }}
                        />
                        <span className={UI.ink}>{s.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>

            {/* Dates */}
            <Field label={copy.t("create.for")}>
              <div className="flex flex-wrap gap-2">
                {(["today", "week", "weekend", "next"] as const).map((chip) => {
                  const r = dateChipRange(chip, today);
                  return (
                    <Chip key={chip} active={!pickDates && draft.starts_at === r.start && draft.ends_at === r.end} onClick={() => chooseDates(chip)}>
                      {copy.t(`dates.${chip}` as PromoCopyKey)}
                    </Chip>
                  );
                })}
                <Chip active={pickDates} onClick={() => setPickDates((v) => !v)}>{copy.t("dates.pick")}</Chip>
                {draft.template === "slow_day" || draft.template === "custom" ? (
                  <Chip active={draft.ends_at === null} onClick={() => set({ ends_at: null })}>{copy.t("dates.always")}</Chip>
                ) : null}
              </div>
              {pickDates ? (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <label className="flex min-w-0 flex-col gap-1 text-[12px]">
                    <span className={UI.muted}>{copy.t("dates.from")}</span>
                    <input type="date" className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--tc-border,#d1d1d6)] bg-white px-3 text-[16px] text-[#1c1c1e]" value={draft.starts_at ?? ""} onChange={(e) => set({ starts_at: e.target.value || null })} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[12px]">
                    <span className={UI.muted}>{copy.t("dates.to")}</span>
                    <input type="date" className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--tc-border,#d1d1d6)] bg-white px-3 text-[16px] text-[#1c1c1e]" value={draft.ends_at ?? ""} onChange={(e) => set({ ends_at: e.target.value || null })} />
                  </label>
                </div>
              ) : null}
              {draft.template === "slow_day" ? <Weekdays copy={copy} days={draft.weekdays} onToggle={toggleDay} /> : null}
            </Field>

            {/* Spots */}
            <Field label={copy.t("create.only")}>
              <div className="flex flex-wrap items-center gap-2">
                {SPOT_CHIPS.map((n) => (
                  <Chip key={n} active={draft.max_uses === n} onClick={() => set({ max_uses: n })}>{n}</Chip>
                ))}
                <Chip active={draft.max_uses === null} onClick={() => set({ max_uses: null })}>{copy.t("spots.unlimited")}</Chip>
                {draft.max_uses !== null ? (
                  <NumberBox label={copy.t("create.only")} value={draft.max_uses} min={1} onChange={(n) => set({ max_uses: n })} />
                ) : null}
              </div>
            </Field>
          </div>

          <PromoPreview draft={draft} service={service} result={result} addonLabel={addon?.label ?? null} copy={copy} />

          {data.services.length > 1 ? (
            <div className="flex flex-wrap gap-2" aria-label={copy.t("preview.no_service")}>
              {data.services.slice(0, 8).map((s) => (
                <Chip key={s.id} active={service?.id === s.id} onClick={() => setServiceId(s.id)}>{s.title}</Chip>
              ))}
            </div>
          ) : null}

          {earn && service && earn.net_per_booking_cents > 0 ? (
            <p className={`flex items-center justify-between pl-1 text-[13px] font-medium ${UI.ink}`}>
              {earn.total_cents !== null && (earn.bookings ?? 0) > 1
                ? copy.t("earn.total", { amount: money(earn.total_cents) })
                : copy.t("earn.each", { amount: money(earn.net_per_booking_cents) })}
              <InfoTip text={copy.t("earn.info")} label={copy.t("info.label")} />
            </p>
          ) : null}

          {nudges.map((n) =>
            n.kind === "big_discount" ? (
              <p key="big" role="status" className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">{copy.t("nudge.big", { n: n.pct })}</p>
            ) : (
              <p key={n.promoId} role="status" className="rounded-xl bg-sky-50 p-3 text-[13px] text-sky-900">
                {copy.t(n.thisIsBetter ? "nudge.overlap_this" : "nudge.overlap_other", { name: n.name, n: n.otherPct })}
              </p>
            ),
          )}

          {verdict && verdict.keepsTerms ? (
            <p role="status" className="rounded-xl bg-sky-50 p-3 text-[13px] text-sky-900">{copy.t("edit.keeps", { n: usedCount })}</p>
          ) : null}

          {/* More options */}
          <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className={`${UI.quiet} self-start`}>
            {copy.t("more.options")} {showMore ? "−" : "+"}
          </button>
          {showMore ? (
            <div className={`${UI.card} flex flex-col gap-4 p-4`}>
              <Field label={copy.t("create.name")}>
                <input
                  className={UI.field}
                  value={draft.name}
                  maxLength={80}
                  // The template fills a default name; typing should replace it, not append to it.
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              {draft.offer_kind !== "free_addon" ? (
                <Field label={copy.t("create.discount")}>
                  <div className="flex flex-wrap gap-2">
                    {OFFERS.map((k) => (
                      <Chip
                        key={k}
                        active={draft.offer_kind === k}
                        onClick={() => !locked && set({ offer_kind: k, value: k === "percent" ? 20 : 10_000 })}
                      >
                        {k === "percent" ? "%" : k === "fixed" ? "$ -" : "$ ="}
                      </Chip>
                    ))}
                  </div>
                </Field>
              ) : null}
              <Field label={copy.t("more.who")}>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map((a) => (
                    <Chip key={a} active={draft.audience === a} onClick={() => !locked && set({ audience: a })}>
                      {copy.t(`who.${a}` as PromoCopyKey)}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label={copy.t("more.how")}>
                <div className="flex flex-wrap gap-2">
                  {UNLOCKS.map((u) => (
                    <Chip key={u} active={draft.unlock === u} onClick={() => set({ unlock: u })}>{copy.t(`unlock.${u}` as PromoCopyKey)}</Chip>
                  ))}
                </div>
                {draft.unlock === "code" ? (
                  <input
                    aria-label={copy.t("more.code")}
                    className={`mt-2 uppercase ${UI.field}`}
                    value={draft.code ?? ""}
                    disabled={locked}
                    maxLength={40}
                    onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                  />
                ) : null}
              </Field>
              {draft.template !== "slow_day" ? (
                <Field label={copy.t("days.label")}>
                  <Weekdays copy={copy} days={draft.weekdays} onToggle={toggleDay} />
                </Field>
              ) : null}
              <Field label={copy.t("more.time")}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <input type="time" aria-label={copy.t("dates.from")} className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--tc-border,#d1d1d6)] bg-white px-3 text-[16px] text-[#1c1c1e]" value={draft.time_from ?? ""} onChange={(e) => set({ time_from: e.target.value || null })} />
                  <input type="time" aria-label={copy.t("dates.to")} className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--tc-border,#d1d1d6)] bg-white px-3 text-[16px] text-[#1c1c1e]" value={draft.time_to ?? ""} onChange={(e) => set({ time_to: e.target.value || null })} />
                </div>
              </Field>
              <Field label={copy.t("more.per_client")}>
                <NumberBox label={copy.t("more.per_client")} value={draft.per_client_max} min={1} onChange={(n) => set({ per_client_max: n })} />
              </Field>
              <Field label={copy.t("more.min")}>
                <NumberBox
                  label={copy.t("more.min")}
                  value={Math.round((draft.min_subtotal_cents ?? 0) / 100)}
                  min={0}
                  onChange={(n) => set({ min_subtotal_cents: n > 0 ? n * 100 : null })}
                />
              </Field>
              {data.plan === "free" ? (
                <p className={`flex items-center gap-1 text-[12px] ${UI.muted}`}>
                  {copy.t("more.paid_only")}
                  <InfoTip text={copy.t("paid.info")} label={copy.t("info.label")} />
                </p>
              ) : null}
            </div>
          ) : null}

          {verdict && verdict.locked.length > 0 ? (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-800">
              {copy.t("edit.locked", { fields: verdict.locked.map((f) => copy.t(`field.${f}` as PromoCopyKey)).join(", ") })}
            </p>
          ) : null}
          {errors.length > 0 ? (
            <ul role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-800">
              {errors.map((e) => <li key={e}>{copy.t(errKey(e))}</li>)}
            </ul>
          ) : null}
          {serverError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-800">{copy.t(serverError)}</p> : null}
        </div>

        {/* Thumb zone: sticky footer with one primary action. */}
        <div className="flex items-center gap-2 border-t border-[var(--tc-border,#e5e5ea)] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {editingId ? (
            <button type="button" className={`${UI.primary} flex-1`} disabled={busy} onClick={() => submit("live")}>
              {copy.t("action.save")}
            </button>
          ) : (
            <>
              <button type="button" className={UI.secondary} disabled={busy} onClick={() => submit("draft")}>
                {copy.t("action.save_draft")}
              </button>
              <button type="button" className={`${UI.primary} flex-1`} disabled={busy} onClick={() => submit("live")}>
                {scheduled ? copy.t("action.schedule") : copy.t("action.go_live_now")}
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={`text-[12px] font-semibold uppercase tracking-wide ${UI.muted}`}>{label}</span>
      {children}
    </div>
  );
}

function Weekdays({ copy, days, onToggle }: { copy: PromoCopy; days: readonly number[]; onToggle: (d: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <Chip key={d} active={days.includes(d)} onClick={() => onToggle(d)}>
          {copy.t(`weekday.${d}` as "weekday.0")}
        </Chip>
      ))}
    </div>
  );
}

/** Stepper (-/+) with a typed fallback, for the numbers in the common path. */
function NumberBox({
  label, value, min, max, onChange, suffix,
}: {
  label: string; value: number; min: number; max?: number; onChange: (n: number) => void; suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, Math.round(n)));
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <button type="button" aria-label={`${label} -`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tc-border,#e5e5ea)] text-[18px]" onClick={() => onChange(clamp(value - 1))}>{"−"}</button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        className="min-h-11 w-16 rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white px-2 text-center text-[16px] text-[#1c1c1e]"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      {suffix ? <span className={`text-[13px] ${UI.muted}`}>{suffix}</span> : null}
      <button type="button" aria-label={`${label} +`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tc-border,#e5e5ea)] text-[18px]" onClick={() => onChange(clamp(value + 1))}>+</button>
    </span>
  );
}
