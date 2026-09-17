"use client";

/**
 * event-tab-program-sheet — the add / edit sheet of the Programa tab
 * (proposal §4). The shell's own drawer (`DrawerShell`: full-height on the
 * phone, a side panel on desktop), one form for both create and update.
 *
 * Preset first, advanced hidden: title, kind, night, time, performer and
 * place are the form; staff-only, draft / published and the sponsor sit
 * behind one disclosure. The form holds strings in the VENUE'S zone and
 * `draftToInput` (pure, tested) turns them into the model's input before
 * `saveScheduleItem` sees anything, so every refusal the pure schema can
 * make is a sentence next to its field, never a round trip.
 */

import { useEffect, useRef, useState, useTransition } from "react";

import { saveScheduleItem, searchPerformers, type SearchPerformersResult } from "@/app/(workspace)/[tenantSlug]/admin/_events-schedule-actions";
import { SCHEDULE_ITEM_KINDS, type ScheduleItem } from "@/lib/events/schedule/model";
import { draftFromItem, draftToInput, emptyDraft, toSaveWire, type DraftIssue, type ProgramItemDraft } from "@/lib/events/schedule/program-tab-model";
import { MediaField, toMediaValue } from "@/components/edit-chrome/inspectors/kit/media-field";
import { useT } from "@/i18n/use-t";

import { ActionButton, BUTTON_PRIMARY, Outcome } from "../appointments-classes-ui";
import { DrawerShell } from "../../primitives";
import { Field, INPUT, SELECT, SelectShell, Switch } from "../catalog/catalog-ui";

export type NightOption = { id: string; label: string };
export type PlaceOption = { id: string; name: string; kind: string };
type Performer = Extract<SearchPerformersResult, { ok: true }>["performers"][number];

const TEXTAREA = `${INPUT} h-auto min-h-[84px] resize-y py-[8px] leading-[1.45]`;

export function ProgramItemSheet({
  open,
  eventId,
  tenantId,
  zone,
  nights,
  places,
  item,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventId: string;
  tenantId: string | null;
  zone: string | null;
  nights: NightOption[];
  places: PlaceOption[];
  /** null = add. */
  item: ScheduleItem | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<ProgramItemDraft>(() => emptyDraft(nights.map((n) => n.id)));
  const [issue, setIssue] = useState<DraftIssue | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, start] = useTransition();

  // Reset the form on every open: the sheet is one instance, the row changes.
  useEffect(() => {
    if (!open) return;
    setDraft(item ? draftFromItem(item, zone) : emptyDraft(nights.map((n) => n.id)));
    setIssue(null);
    setRefusal(null);
    setAdvanced(item ? item.visibility === "staff" || item.status === "published" || Boolean(item.sponsor.name) : false);
    // `nights` is memoised by the tab from the event row, so this runs per open, not per render.
  }, [open, item, zone, nights]);

  const patch = <K extends keyof ProgramItemDraft>(key: K, value: ProgramItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const issueText = (code: DraftIssue["code"]): string => {
    switch (code) {
      case "title":
        return t("dashboard.events.program.sheet.needTitle");
      case "start":
        return t("dashboard.events.program.sheet.needStart");
      case "zone":
        return t("dashboard.events.program.sheet.needZone");
      case "end":
        return t("dashboard.events.program.sheet.endAfterStart");
      case "link":
        return t("dashboard.events.program.sheet.badLink");
      case "sponsorUrl":
        return t("dashboard.events.program.sheet.badSponsorUrl");
      default:
        return t("dashboard.events.program.sheet.invalid");
    }
  };
  const under = (field: DraftIssue["field"], fallback?: string | null) => (issue && issue.field === field ? issueText(issue.code) : (fallback ?? null));

  const save = () => {
    setIssue(null);
    setRefusal(null);
    const r = draftToInput(draft, zone, item ? item.sortOrder : nextSortOrder);
    if (!r.ok) {
      setIssue(r.issue);
      return;
    }
    const wire = toSaveWire(r.input, eventId, item?.id ?? null);
    start(async () => {
      const res = await saveScheduleItem(wire);
      if (!res.ok) {
        setRefusal(res.error);
        return;
      }
      onSaved();
    });
  };

  const footer = (
    <>
      {issue && issue.field === "form" ? <Outcome kind="refused">{issueText(issue.code)}</Outcome> : null}
      {refusal ? <Outcome kind="refused" testId="events-program-sheet-refusal">{refusal}</Outcome> : null}
      <ActionButton onClick={onClose} disabled={busy}>
        {t("dashboard.events.program.sheet.cancel")}
      </ActionButton>
      <button type="button" onClick={save} disabled={busy} className={`${BUTTON_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`} data-testid="events-program-sheet-save">
        {busy ? t("dashboard.events.program.sheet.saving") : item ? t("dashboard.events.program.sheet.save") : t("dashboard.events.program.sheet.add")}
      </button>
    </>
  );

  return (
    <DrawerShell open={open} onClose={onClose} title={item ? t("dashboard.events.program.sheet.editTitle") : t("dashboard.events.program.sheet.addTitle")} footer={footer} resizable={false} canClose={!busy}>
      <div className="flex flex-col gap-[14px]" data-testid="events-program-sheet">
        <Field label={t("dashboard.events.program.sheet.title")} required hint={under("title")}>
          <input className={INPUT} value={draft.title} onChange={(e) => patch("title", e.target.value)} maxLength={200} disabled={busy} aria-label={t("dashboard.events.program.sheet.title")} data-testid="events-program-title" />
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[12px] max-[720px]:grid-cols-1">
          <Field label={t("dashboard.events.program.sheet.kind")}>
            <SelectShell>
              <select className={SELECT} value={draft.kind} onChange={(e) => patch("kind", e.target.value as ProgramItemDraft["kind"])} disabled={busy} aria-label={t("dashboard.events.program.sheet.kind")} data-testid="events-program-kind">
                {SCHEDULE_ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`dashboard.events.program.kind.${k}`)}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>
          {nights.length > 1 ? (
            <Field label={t("dashboard.events.program.sheet.night")}>
              <SelectShell>
                <select className={SELECT} value={draft.sessionId} onChange={(e) => patch("sessionId", e.target.value)} disabled={busy} aria-label={t("dashboard.events.program.sheet.night")} data-testid="events-program-night">
                  <option value="">{t("dashboard.events.program.sheet.nightNone")}</option>
                  {nights.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-[12px]">
          <div className="font-admin-body text-[12.5px] font-semibold text-admin-ink">{t("dashboard.events.program.sheet.timeTba")}</div>
          <Switch on={draft.timeTba} onChange={(on) => patch("timeTba", on)} label={t("dashboard.events.program.sheet.timeTba")} testId="events-program-time-tba" />
        </div>
        {!draft.timeTba ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[12px] max-[720px]:grid-cols-1">
            <Field label={t("dashboard.events.program.sheet.start")} required hint={under("startsLocal", zone ? `${t("dashboard.events.program.sheet.zoneHint")} ${zone}` : t("dashboard.events.program.sheet.needZone"))}>
              <input type="datetime-local" className={INPUT} value={draft.startsLocal} onChange={(e) => patch("startsLocal", e.target.value)} disabled={busy} aria-label={t("dashboard.events.program.sheet.start")} data-testid="events-program-start" />
            </Field>
            <Field label={t("dashboard.events.program.sheet.end")} hint={under("endsLocal", t("dashboard.events.program.sheet.endHint"))}>
              <input type="datetime-local" className={INPUT} value={draft.endsLocal} onChange={(e) => patch("endsLocal", e.target.value)} disabled={busy} aria-label={t("dashboard.events.program.sheet.end")} data-testid="events-program-end" />
            </Field>
          </div>
        ) : null}

        <PerformerField draft={draft} patch={patch} busy={busy} />

        <Field label={t("dashboard.events.program.sheet.place")} hint={places.length === 0 ? t("dashboard.events.program.sheet.placeNone") : null}>
          <SelectShell>
            <select className={SELECT} value={draft.spaceId} onChange={(e) => patch("spaceId", e.target.value)} disabled={busy || places.length === 0} aria-label={t("dashboard.events.program.sheet.place")} data-testid="events-program-place">
              <option value="">{t("dashboard.events.program.sheet.placeAny")}</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </SelectShell>
        </Field>

        <Field label={t("dashboard.events.program.sheet.cover")} hint={t("dashboard.events.program.sheet.coverHint")}>
          {tenantId ? (
            <MediaField
              tenantId={tenantId}
              value={toMediaValue(draft.coverUrl, draft.coverMediaId || null)}
              onChange={(next) => setDraft((d) => ({ ...d, coverUrl: next?.url ?? null, coverMediaId: next?.mediaId ?? "" }))}
              emptyLabel={draft.coverMediaId ? t("dashboard.events.program.sheet.coverReplace") : t("dashboard.events.program.sheet.coverEmpty")}
              aspect="16/9"
              allowUrlPaste={false}
              disabled={busy}
              pickerTitle={t("dashboard.events.program.sheet.cover")}
            />
          ) : (
            <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.events.loading")}</p>
          )}
          {draft.coverMediaId && !draft.coverUrl ? (
            <div className="mt-[6px] flex items-center gap-[8px] font-admin-body text-[11.5px] text-admin-ink-muted">
              <span>{t("dashboard.events.program.sheet.coverKept")}</span>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, coverMediaId: "", coverUrl: null }))} disabled={busy} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-admin-brand hover:underline" data-testid="events-program-cover-clear">
                {t("dashboard.events.program.sheet.coverClear")}
              </button>
            </div>
          ) : null}
        </Field>

        <Field label={t("dashboard.events.program.sheet.description")} hint={t("dashboard.events.program.sheet.descriptionHint")}>
          <textarea className={TEXTAREA} value={draft.description} onChange={(e) => patch("description", e.target.value)} maxLength={600} disabled={busy} aria-label={t("dashboard.events.program.sheet.description")} data-testid="events-program-description" />
        </Field>

        <Field label={t("dashboard.events.program.sheet.link")} hint={under("link", t("dashboard.events.program.sheet.linkHint"))}>
          <input type="url" inputMode="url" className={INPUT} value={draft.link} onChange={(e) => patch("link", e.target.value)} placeholder="https://" disabled={busy} aria-label={t("dashboard.events.program.sheet.link")} data-testid="events-program-link" />
        </Field>

        <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="cursor-pointer self-start border-0 bg-transparent p-0 font-admin-body text-[12.5px] font-semibold text-admin-brand hover:underline" data-testid="events-program-advanced">
          {advanced ? t("dashboard.events.program.sheet.advancedHide") : t("dashboard.events.program.sheet.advancedShow")}
        </button>
        {advanced ? (
          <div className="flex flex-col gap-[12px] rounded-[10px] border border-admin-border-soft p-[12px]" data-testid="events-program-advanced-panel">
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="font-admin-body text-[12.5px] font-semibold text-admin-ink">{t("dashboard.events.program.sheet.staffOnly")}</div>
                <p className="m-0 mt-[2px] font-admin-body text-[11.5px] leading-[1.35] text-admin-ink-muted">{t("dashboard.events.program.sheet.staffOnlyHint")}</p>
              </div>
              <Switch on={draft.staffOnly} onChange={(on) => patch("staffOnly", on)} label={t("dashboard.events.program.sheet.staffOnly")} testId="events-program-staff-only" />
            </div>
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="font-admin-body text-[12.5px] font-semibold text-admin-ink">{t("dashboard.events.program.sheet.published")}</div>
                <p className="m-0 mt-[2px] font-admin-body text-[11.5px] leading-[1.35] text-admin-ink-muted">{t("dashboard.events.program.sheet.publishedHint")}</p>
              </div>
              <Switch on={draft.status === "published"} onChange={(on) => patch("status", on ? "published" : "draft")} label={t("dashboard.events.program.sheet.published")} testId="events-program-published" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[12px] max-[720px]:grid-cols-1">
              <Field label={t("dashboard.events.program.sheet.sponsorName")}>
                <input className={INPUT} value={draft.sponsorName} onChange={(e) => patch("sponsorName", e.target.value)} maxLength={120} disabled={busy} aria-label={t("dashboard.events.program.sheet.sponsorName")} data-testid="events-program-sponsor-name" />
              </Field>
              <Field label={t("dashboard.events.program.sheet.sponsorUrl")} hint={under("sponsorUrl")}>
                <input type="url" inputMode="url" className={INPUT} value={draft.sponsorUrl} onChange={(e) => patch("sponsorUrl", e.target.value)} placeholder="https://" disabled={busy} aria-label={t("dashboard.events.program.sheet.sponsorUrl")} data-testid="events-program-sponsor-url" />
              </Field>
            </div>
          </div>
        ) : null}
      </div>
    </DrawerShell>
  );
}

/**
 * The performer: a linked profile as a chip (roster first, then public
 * talent, through `searchPerformers`), or a free-text name, or "to be
 * announced". A linked profile keeps its name in `performer_name` too, so
 * an unpublished profile still has a name to fall back on (proposal §10).
 */
function PerformerField({ draft, patch, busy }: { draft: ProgramItemDraft; patch: <K extends keyof ProgramItemDraft>(key: K, value: ProgramItemDraft[K]) => void; busy: boolean }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Performer[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    timer.current = setTimeout(() => {
      setSearching(true);
      void searchPerformers({ query: q }).then((r) => {
        if (!alive) return;
        setSearching(false);
        if (!r.ok) {
          setSearchError(r.error);
          setResults([]);
          return;
        }
        setSearchError(null);
        setResults(r.performers);
      });
    }, 250);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const pick = (p: Performer) => {
    patch("performerId", p.id);
    patch("performerName", p.name);
    patch("performerHeroUrl", p.heroUrl);
    setQuery("");
    setResults(null);
  };
  const unlink = () => {
    patch("performerId", "");
    patch("performerHeroUrl", null);
  };

  return (
    <div className="flex flex-col gap-[8px]" data-testid="events-program-performer">
      <div className="flex items-center justify-between gap-[12px]">
        <div className="font-admin-body text-[12.5px] font-semibold text-admin-ink">{t("dashboard.events.program.sheet.performer")}</div>
        <label className="flex items-center gap-[8px] font-admin-body text-[12px] text-admin-ink-muted">
          {t("dashboard.events.program.sheet.performerTba")}
          <Switch on={draft.performerTba} onChange={(on) => patch("performerTba", on)} label={t("dashboard.events.program.sheet.performerTba")} testId="events-program-performer-tba" />
        </label>
      </div>
      {draft.performerTba ? null : draft.performerId ? (
        <div className="flex items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-surface-alt px-[10px] py-[6px]" data-testid="events-program-performer-chip">
          {draft.performerHeroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.performerHeroUrl} alt="" className="h-[24px] w-[24px] rounded-full object-cover" />
          ) : (
            <span aria-hidden className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-full bg-admin-border-soft font-admin-body text-[11px] font-semibold text-admin-ink-muted">
              {draft.performerName.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-admin-body text-[13px] font-semibold text-admin-ink">{draft.performerName}</span>
          <span className="font-admin-body text-[11px] text-admin-ink-muted">{t("dashboard.events.program.sheet.performerLinked")}</span>
          <button type="button" onClick={unlink} disabled={busy} aria-label={t("dashboard.events.program.sheet.performerUnlink")} className="cursor-pointer border-0 bg-transparent p-0 font-admin-body text-[12px] font-semibold text-admin-brand hover:underline" data-testid="events-program-performer-unlink">
            {t("dashboard.events.program.sheet.performerUnlink")}
          </button>
        </div>
      ) : (
        <>
          <input className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("dashboard.events.program.sheet.performerSearch")} disabled={busy} aria-label={t("dashboard.events.program.sheet.performerSearch")} data-testid="events-program-performer-search" />
          {searching ? <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.events.program.sheet.performerSearching")}</p> : null}
          {searchError ? <Outcome kind="refused">{searchError}</Outcome> : null}
          {results && results.length === 0 && !searching ? <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-muted">{t("dashboard.events.program.sheet.performerNone")}</p> : null}
          {results && results.length > 0 ? (
            <ul className="m-0 flex max-h-[200px] list-none flex-col overflow-y-auto rounded-[9px] border border-admin-border p-0" data-testid="events-program-performer-results">
              {results.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex w-full cursor-pointer items-center gap-[8px] border-0 bg-transparent px-[10px] py-[7px] text-left hover:bg-admin-surface-alt" data-testid={`events-program-performer-pick-${p.id}`}>
                    {p.heroUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.heroUrl} alt="" className="h-[22px] w-[22px] rounded-full object-cover" />
                    ) : (
                      <span aria-hidden className="inline-block h-[22px] w-[22px] rounded-full bg-admin-border-soft" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-admin-body text-[13px] text-admin-ink">{p.name}</span>
                    <span className="font-admin-body text-[11px] text-admin-ink-muted">{p.source === "roster" ? t("dashboard.events.program.sheet.sourceRoster") : t("dashboard.events.program.sheet.sourcePublic")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Field label={t("dashboard.events.program.sheet.performerName")} hint={t("dashboard.events.program.sheet.performerNameHint")}>
            <input className={INPUT} value={draft.performerName} onChange={(e) => patch("performerName", e.target.value)} maxLength={200} disabled={busy} aria-label={t("dashboard.events.program.sheet.performerName")} data-testid="events-program-performer-name" />
          </Field>
        </>
      )}
    </div>
  );
}
