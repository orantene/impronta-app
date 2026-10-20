"use client";

/**
 * OwnerHubScreen — the owner's service hub inside the Catalog (TUL-1369):
 * review queue, suggested groups, entries (own services in the same list) with
 * per-entry settings, merge and split. One primary action per card. Fields a
 * role may not change are disabled with a reason, never hidden.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SmartImage } from "@/components/ui/smart-image";

import {
  addOwnServiceAction,
  decideQueueItemAction,
  mergeEntriesAction,
  splitEntryAction,
  updateEntryAction,
} from "@/lib/server-actions/service-hub-entries";
import type { HubEntry, OwnerHub } from "@/lib/service-hub/entries.server";
import { fieldsAllowed, type HubRole } from "@/lib/service-hub/entry-permissions";
import { blockerSentence, ownerHubCopy, type OwnerHubCopy } from "@/lib/service-hub/owner-hub-copy";

type Ok = Extract<OwnerHub, { ok: true }>;

const CARD = "flex flex-col gap-2 rounded-lg border border-admin-border bg-admin-card px-3 py-3";
const BTN = "inline-flex h-8 cursor-pointer items-center rounded-md border border-admin-border bg-admin-card px-3 text-admin-13 text-admin-ink disabled:opacity-50";
const PRIMARY = "inline-flex h-8 cursor-pointer items-center rounded-md bg-admin-brand px-3 text-admin-13 font-semibold text-white disabled:opacity-50";
const INPUT = "h-8 rounded-md border border-admin-border bg-admin-card px-2 text-admin-13 text-admin-ink disabled:opacity-60";

function money(cents: number | null, currency: string | null, locale: string): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency ?? "USD" }).format(cents / 100);
  } catch {
    return `${currency ?? ""} ${(cents / 100).toFixed(2)}`;
  }
}

function useRun(c: OwnerHubCopy) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (work: () => Promise<{ ok: boolean; reason?: string; blockers?: string[] }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await work();
      if (res.ok) router.refresh();
      else if (res.reason === "blocked") setMessage(blockerSentence(c, res.blockers ?? []));
      else if (res.reason === "not_allowed") setMessage(c.notAllowed);
      else setMessage(c.failed);
    } catch {
      setMessage(c.failed);
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

function EntrySettings({ entry, roles, locale, c }: { entry: HubEntry; roles: readonly HubRole[]; locale: string; c: OwnerHubCopy }) {
  const allowed = new Set<string>(fieldsAllowed(roles));
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState(entry.category ?? "");
  const [price, setPrice] = useState(entry.hubPriceCents == null ? "" : String(entry.hubPriceCents / 100));
  const [showWho, setShowWho] = useState(entry.showWho);
  const [contact, setContact] = useState(entry.clientContact);
  const [booking, setBooking] = useState(entry.bookingType);
  const [featured, setFeatured] = useState(entry.featured);
  const [hidden, setHidden] = useState(entry.hidden);
  const [photo, setPhoto] = useState<string | null>(entry.photoMediaId);
  const { busy, message, run } = useRun(c);
  const dis = (f: string) => !allowed.has(f);

  const save = () => {
    const patch: Record<string, unknown> = {};
    if (!dis("name") && name !== entry.name) patch.name = name;
    if (!dis("categoryId") && category !== (entry.category ?? "")) patch.categoryId = category.trim() || null;
    if (!dis("hubPriceCents")) {
      const cents = price.trim() === "" ? null : Math.round(Number(price) * 100);
      if (cents !== entry.hubPriceCents && (cents === null || Number.isFinite(cents))) patch.hubPriceCents = cents;
    }
    if (!dis("showWho") && showWho !== entry.showWho) patch.showWho = showWho;
    if (!dis("clientContact") && contact !== entry.clientContact) patch.clientContact = contact;
    if (!dis("bookingType") && booking !== entry.bookingType) patch.bookingType = booking;
    if (!dis("featured") && featured !== entry.featured) patch.featured = featured;
    if (!dis("hidden") && hidden !== entry.hidden) patch.hidden = hidden;
    if (!dis("photoMediaId") && photo !== entry.photoMediaId) patch.photoMediaId = photo;
    if (Object.keys(patch).length === 0) return;
    void run(() => updateEntryAction({ entryId: entry.id, patch }));
  };
  const lock = (f: string) => (dis(f) ? c.adminOnly : undefined);

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid={`entry-settings-${entry.id}`}>
      <label className="flex flex-col gap-1 text-admin-12"><span>{c.name}</span><input className={INPUT} value={name} disabled={dis("name")} onChange={(e) => setName(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-admin-12"><span>{c.category}</span><input className={INPUT} value={category} disabled={dis("categoryId")} onChange={(e) => setCategory(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-admin-12" title={lock("hubPriceCents")}><span>{c.hubPrice}</span><input className={INPUT} inputMode="decimal" value={price} disabled={dis("hubPriceCents")} onChange={(e) => setPrice(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-admin-12" title={lock("showWho")}><span>{c.showWho}</span>
        <select className={INPUT} value={showWho} disabled={dis("showWho")} onChange={(e) => setShowWho(e.target.value as typeof showWho)}>
          <option value="name">{c.showName}</option><option value="portfolio">{c.showPortfolio}</option><option value="hidden">{c.showHidden}</option>
        </select></label>
      <label className="flex flex-col gap-1 text-admin-12" title={lock("clientContact")}><span>{c.clientContact}</span>
        <select className={INPUT} value={contact} disabled={dis("clientContact")} onChange={(e) => setContact(e.target.value as typeof contact)}>
          <option value="workspace">{c.contactWorkspace}</option><option value="talent">{c.contactTalent}</option>
        </select></label>
      <label className="flex flex-col gap-1 text-admin-12"><span>{c.bookingType}</span>
        <select className={INPUT} value={booking} disabled={dis("bookingType")} onChange={(e) => setBooking(e.target.value as typeof booking)}>
          <option value="request">{c.bookingRequest}</option><option value="instant">{c.bookingInstant}</option>
        </select></label>
      <label className="flex items-center gap-2 text-admin-12"><input type="checkbox" checked={featured} disabled={dis("featured")} onChange={(e) => { setFeatured(e.target.checked); if (e.target.checked) setHidden(false); }} />{c.featured}</label>
      <label className="flex items-center gap-2 text-admin-12"><input type="checkbox" checked={hidden} disabled={dis("hidden")} onChange={(e) => { setHidden(e.target.checked); if (e.target.checked) setFeatured(false); }} />{c.hiddenLabel}</label>
      {entry.photoChoices.length > 0 ? (
        <fieldset className="col-span-full" data-testid={`entry-photo-${entry.id}`} disabled={dis("photoMediaId")}>
          <legend className="text-admin-12">{c.photo}</legend>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={c.photo}>
            <button type="button" role="radio" aria-checked={photo === null} onClick={() => setPhoto(null)} className={`min-h-[44px] rounded-lg border px-3 text-admin-12 ${photo === null ? "border-admin-ink" : "border-admin-line"}`}>{c.photoNone}</button>
            {entry.photoChoices.map((p) => (
              <button key={p.mediaId} type="button" role="radio" aria-checked={photo === p.mediaId} onClick={() => setPhoto(p.mediaId)} className={`overflow-hidden rounded-lg border ${photo === p.mediaId ? "border-2 border-admin-ink" : "border-admin-line"}`}>
                <SmartImage src={p.url} alt="" width={64} height={64} className="size-16 object-cover" />
              </button>
            ))}
          </div>
          <p className="mt-1 text-admin-11 text-admin-ink-muted">{c.photoHint}</p>
        </fieldset>
      ) : null}
      <div className="col-span-full flex items-center gap-2">
        <button type="button" className={PRIMARY} disabled={busy} onClick={save}>{c.save}</button>
        {message ? <span role="alert" className="text-admin-12 text-admin-ink-muted">{message}</span> : null}
      </div>
      <span className="hidden">{locale}</span>
    </div>
  );
}

function EntryCard({ entry, others, roles, locale, c }: { entry: HubEntry; others: readonly HubEntry[]; roles: readonly HubRole[]; locale: string; c: OwnerHubCopy }) {
  const [open, setOpen] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, message, run } = useRun(c);
  const canGroup = roles.includes("admin") || roles.includes("editor");
  return (
    <li className={CARD} data-testid={`entry-${entry.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-admin-ink">
          {entry.name}
          {entry.ownOfferingId ? <span className="ml-2 rounded bg-admin-surface-alt px-1.5 py-0.5 text-admin-11 font-medium">{c.own}</span> : null}
        </span>
        <span className="text-admin-12 text-admin-ink-muted">
          {entry.ownOfferingId ? "" : c.members.replace("{n}", String(entry.members.length))}
          {entry.hubPriceCents != null ? ` · ${money(entry.hubPriceCents, entry.currency, locale)}` : ""}
        </span>
      </div>
      {!entry.ownOfferingId && entry.members.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-admin-12">
          {entry.members.map((m) => (
            <li key={m.listingId} className="flex items-center gap-2">
              {canGroup && entry.members.length > 1 ? (
                <input type="checkbox" aria-label={m.talentName} checked={picked.includes(m.listingId)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.listingId] : p.filter((x) => x !== m.listingId)))} />
              ) : null}
              <span>{m.talentName}</span>
              <span className="text-admin-ink-muted">{money(m.priceCents, m.currency, locale)}{m.durationMinutes != null ? ` · ${m.durationMinutes} ${c.minutes}` : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {entry.differences.length > 0 ? (
        <p className="m-0 text-admin-12 text-admin-ink-muted">
          {c.differs}: {entry.differences.map((d) => (d.field === "price" ? c.price : d.field === "duration" ? c.duration : c.name)).join(", ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{c.settings}</button>
        {canGroup && !entry.ownOfferingId && others.length > 0 ? (
          <>
            <select className={INPUT} value={mergeId} onChange={(e) => setMergeId(e.target.value)} aria-label={c.mergeInto}>
              <option value="">{c.mergeInto}</option>
              {others.filter((o) => !o.ownOfferingId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button type="button" className={BTN} disabled={busy || !mergeId} onClick={() => void run(() => mergeEntriesAction({ keepId: mergeId, mergeId: entry.id }))}>{c.merge}</button>
          </>
        ) : null}
        {canGroup && picked.length > 0 ? (
          <button type="button" className={BTN} disabled={busy} title={c.splitHint} onClick={() => void run(() => splitEntryAction({ entryId: entry.id, listingIds: picked }))}>{c.split}</button>
        ) : null}
        {message ? <span role="alert" className="text-admin-12 text-admin-ink-muted">{message}</span> : null}
      </div>
      {open ? <EntrySettings entry={entry} roles={roles} locale={locale} c={c} /> : null}
    </li>
  );
}

export function OwnerHubScreen({ hub, roles, locale }: { hub: Ok; roles: readonly HubRole[]; locale: string }) {
  const c = ownerHubCopy(locale);
  const { busy, message, run } = useRun(c);
  const canQueue = roles.includes("admin") || roles.includes("editor");
  const byId = new Map(hub.entries.map((e) => [e.id, e]));
  const queueIds = new Map(hub.queue.map((q) => [q.listing.listingId, q]));

  const groupSuggestion = async (ids: string[]) => {
    const [first, ...rest] = ids;
    const made = await decideQueueItemAction({ listingId: first, decision: { kind: "new_entry" } });
    if (!made.ok || !made.entryId) return made;
    for (const id of rest) {
      const r = await decideQueueItemAction({ listingId: id, decision: { kind: "accept_into_group", entryId: made.entryId } });
      if (!r.ok) return r;
    }
    return made;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="owner-hub">
      <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{c.title}</h1>
      {!hub.ready ? <p role="status" className="m-0 text-admin-13 text-admin-ink-muted">{c.notReady}</p> : null}
      {message ? <p role="alert" className="m-0 text-admin-13 text-admin-ink-muted">{message}</p> : null}

      <section aria-label={c.queueTitle} className="flex flex-col gap-2">
        <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{c.queueTitle}{hub.queue.length > 0 ? ` · ${hub.queue.length}` : ""}</h2>
        {hub.queue.length === 0 ? <p className="m-0 text-admin-13 text-admin-ink-muted">{c.queueEmpty}</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {hub.queue.map((q) => (
              <li key={q.listing.listingId} className={CARD} data-testid={`queue-${q.listing.listingId}`}>
                <span className="font-semibold text-admin-ink">{q.listing.title}</span>
                <span className="text-admin-12 text-admin-ink-muted">
                  {q.listing.talentName} · {money(q.listing.priceCents, q.listing.currency, locale)}
                  {q.listing.durationMinutes != null ? ` · ${q.listing.durationMinutes} ${c.minutes}` : ""}
                </span>
                <div className="flex flex-wrap gap-2">
                  {q.joinableEntryIds.slice(0, 1).map((id) => (
                    <button key={id} type="button" className={PRIMARY} disabled={busy || !canQueue} onClick={() => void run(() => decideQueueItemAction({ listingId: q.listing.listingId, decision: { kind: "accept_into_group", entryId: id } }))}>
                      {c.addTo.replace("{name}", byId.get(id)?.name ?? "")}
                    </button>
                  ))}
                  <button type="button" className={q.joinableEntryIds.length > 0 ? BTN : PRIMARY} disabled={busy || !canQueue} onClick={() => void run(() => decideQueueItemAction({ listingId: q.listing.listingId, decision: { kind: "new_entry" } }))}>{c.newEntry}</button>
                  <button type="button" className={BTN} disabled={busy || !canQueue} onClick={() => void run(() => decideQueueItemAction({ listingId: q.listing.listingId, decision: { kind: "skip" } }))}>{c.skip}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hub.suggestions.length > 0 && canQueue ? (
        <section aria-label={c.suggestionsTitle} className="flex flex-col gap-2">
          <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{c.suggestionsTitle}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {hub.suggestions.map((s) => (
              <li key={s.listingIds.join("|")} className={CARD}>
                <span className="text-admin-13 text-admin-ink">{s.listingIds.map((id) => queueIds.get(id)?.listing.talentName).filter(Boolean).join(", ")}</span>
                {s.differences.length > 0 ? <span className="text-admin-12 text-admin-ink-muted">{c.differs}: {s.differences.map((d) => (d.field === "price" ? c.price : d.field === "duration" ? c.duration : c.name)).join(", ")}</span> : null}
                <div><button type="button" className={BTN} disabled={busy} onClick={() => void run(() => groupSuggestion(s.listingIds))}>{c.groupThese.replace("{n}", String(s.listingIds.length))}</button></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label={c.entriesTitle} className="flex flex-col gap-2">
        <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{c.entriesTitle}</h2>
        {hub.entries.length === 0 ? <p className="m-0 text-admin-13 text-admin-ink-muted">{c.entriesEmpty}</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {hub.entries.map((e) => <EntryCard key={e.id} entry={e} others={hub.entries.filter((o) => o.id !== e.id)} roles={roles} locale={locale} c={c} />)}
          </ul>
        )}
      </section>

      {hub.ownServices.length > 0 && canQueue ? (
        <section aria-label={c.addOwnTitle} className="flex flex-col gap-2">
          <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{c.addOwnTitle}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {hub.ownServices.map((o) => (
              <li key={o.offeringId} className="flex items-center justify-between gap-2 rounded-lg border border-admin-border px-3 py-2">
                <span className="text-admin-13 text-admin-ink">{o.title}</span>
                <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => addOwnServiceAction({ offeringId: o.offeringId }))}>{c.addOwn}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
