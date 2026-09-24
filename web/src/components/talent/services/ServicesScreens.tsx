"use client";

import { useMemo, useState } from "react";
import {
  importLegacyToOfferings,
  listTalentPortfolioPhotos,
  setOfferingImages,
  type PortfolioPhoto,
} from "@/lib/talent/offerings-actions";
import {
  upsertAddonGroup,
  type AddonGroup,
  type OfferingDestination,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { foldAccent, parseOfferingLine, publicationWord } from "@/lib/talent/publication-state";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { useOfferingsEditor } from "./use-offerings-editor";
import { OfferingCard } from "@/components/talent/offering-card/OfferingCard";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { uploadTalentMedia } from "@/lib/client/signed-upload";

export function PublishedBanner({
  item,
  destinations,
  onClose,
}: {
  item: TalentOffering | null;
  destinations: OfferingDestination[];
  onClose: () => void;
}) {
  const copy = useDashboardText();
  if (!item || publicationWord(item) !== "live") return null;
  return (
    <div className="mt-4 rounded-[12px] border border-admin-border-soft bg-white px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{item.title} {copy.t("is live")}</p>
          <p className="mt-1 text-admin-ink-muted">
            {copy.t("Clients can book it on")}{" "}
            {destinations.map((d) => d.label).join(", ") || copy.t("your connected pages")}.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={copy.t("Close")}>×</button>
      </div>
    </div>
  );
}

export function DefaultsScreen({
  defaults,
  onChange,
  onBack,
  onSave,
}: {
  defaults: SellingDefaults;
  onChange: (next: SellingDefaults) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const copy = useDashboardText();
  const patch = (partial: Partial<SellingDefaults>) => onChange({ ...defaults, ...partial });
  return (
    <div className="max-w-[560px] font-admin-body">
      <button type="button" onClick={onBack} className="text-[13px]">{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[28px]">{copy.t("Defaults")}</h1>
      <p className="text-[13px] text-admin-ink-muted">{copy.t("Applies to new bookings only.")}</p>
      <label className="mt-4 block text-[12px] font-semibold">
        {copy.t("Deposit percentage")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.depositPct ?? ""} onChange={(e) => patch({ depositPct: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Cancelling hours")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.cancelHours ?? ""} onChange={(e) => patch({ cancelHours: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Rescheduling hours")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.rescheduleHours ?? ""} onChange={(e) => patch({ rescheduleHours: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Buffer after")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.bufferAfterMin ?? ""} onChange={(e) => patch({ bufferAfterMin: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="mt-3 block text-[12px] font-semibold">
        {copy.t("Shortest notice (minutes)")}
        <input type="number" className="mt-1 w-full rounded-md border px-2 py-1" value={defaults.minNoticeMin ?? ""} onChange={(e) => patch({ minNoticeMin: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <button type="button" onClick={onSave} className="mt-5 rounded-full bg-admin-brand px-4 py-2 text-white">{copy.t("Save changes")}</button>
    </div>
  );
}

export function OrganizeScreen({
  names,
  items,
  onBack,
  onRename,
  onOrder,
}: {
  names: string[];
  items: TalentOffering[];
  onBack: () => void;
  onRename: (from: string, to: string) => Promise<void>;
  onOrder: (next: string[]) => Promise<void>;
}) {
  const copy = useDashboardText();
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  return (
    <div className="max-w-[640px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[28px]">{copy.t("Organize")}</h1>
      <ul className="mt-4 space-y-2">
        {names.map((name, index) => {
          const count = items.filter((i) => i.category === name).length;
          const photos = items.filter((i) => i.category === name && i.imageUrls.length > 0).length;
          return (
            <li key={name} className="flex items-center justify-between rounded-xl border border-admin-border-soft bg-white px-3 py-2">
              <span>
                <span className="font-semibold">{name}</span>
                <span className="ml-2 text-[12px] text-admin-ink-muted">{count} {copy.t("items")} · {photos} {copy.t("with a photo")}</span>
              </span>
              <span className="flex gap-2 text-[12px]">
                <button type="button" onClick={() => { if (index > 0) void onOrder(move(names, index, -1)); }}>{copy.t("Move up")}</button>
                <button type="button" onClick={() => { setRenameFrom(name); setRenameTo(name); }}>{copy.t("Rename")}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {renameFrom && (
        <div className="mt-4 rounded-xl border p-3">
          <p className="text-[13px]">{copy.t("Rename")} {renameFrom}</p>
          <input className="mt-2 w-full rounded-md border px-2 py-1" maxLength={80} value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          <p className="mt-1 text-[11px] text-admin-ink-muted">{renameTo.length}/80 · {copy.t("Saved links to a heading cannot be redirected.")}</p>
          <button type="button" className="mt-2 rounded-full bg-admin-brand px-3 py-1 text-white" onClick={(event) => {
            const field = event.currentTarget.parentElement?.querySelector("input");
            const next = field instanceof HTMLInputElement ? field.value : renameTo;
            void onRename(renameFrom, next);
            setRenameFrom(null);
          }}>
            {copy.t("Rename all")}
          </button>
        </div>
      )}
    </div>
  );
}

function move(list: string[], index: number, dir: -1 | 1): string[] {
  const next = [...list];
  const swap = index + dir;
  if (swap < 0 || swap >= next.length) return next;
  [next[index], next[swap]] = [next[swap], next[index]];
  return next;
}

export function EditorScreen({
  item,
  setItem,
  locale,
  defaults,
  destinations,
  addons,
  items,
  talentId,
  rates,
  onBack,
  onSave,
  onRefreshAddons,
}: {
  item: TalentOffering;
  setItem: (next: TalentOffering) => void;
  locale: string;
  defaults: SellingDefaults | null;
  destinations: OfferingDestination[];
  addons: AddonGroup[];
  items: TalentOffering[];
  talentId: string;
  rates: ReturnType<typeof useOfferingsEditor>["usdRates"];
  onBack: () => void;
  onSave: (next: TalentOffering, publish: boolean) => Promise<void>;
  onRefreshAddons: () => Promise<void>;
}) {
  const copy = useDashboardText();
  const [preview, setPreview] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [extraName, setExtraName] = useState("");
  const ready = Boolean(item.title) && (item.priceDisplay === "quote" || item.amountCents != null) && (item.kind === "product" || item.durationMinutes != null);
  const patch = (partial: Partial<TalentOffering>) => setItem({ ...item, ...partial });
  const word = publicationWord(item);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <button type="button" onClick={onBack} className="text-[13px]">{copy.t("Back")}</button>
            <h1 className="font-admin-display text-[26px]">{item.id ? item.title : copy.t("New service")}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPreview(true)}>{copy.t("Preview")}</button>
            <button type="button" onClick={() => void onSave(item, false)} className="rounded-full border px-3 py-1.5 text-[13px]">
              {word === "live" ? copy.t("Save changes") : copy.t("Save draft")}
            </button>
            {word !== "live" && (
              <button type="button" onClick={() => void onSave(item, true)} className="rounded-full bg-admin-brand px-3 py-1.5 text-[13px] text-white">
                {copy.t("Publish service")}
              </button>
            )}
          </div>
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">{copy.t("Details")}</h2>
          <label className="block text-[12px] font-semibold">
            {copy.t("Name")}
            <input className="mt-1 w-full rounded-md border px-2 py-2" value={item.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <div>
            <p className="text-[12px] font-semibold">{copy.t("Photos")}</p>
            <div className="mt-2 flex gap-2">
              {item.imageUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-16 w-16 rounded-md object-cover" />
              ))}
              <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed text-[12px]">
                {copy.t("Upload")}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const uploaded = await uploadTalentMedia({
                    file,
                    variantKind: "gallery",
                    talentProfileId: talentId,
                  });
                  if (uploaded.ok) {
                    const offeringId = item.id;
                    if (offeringId) {
                      await setOfferingImages(talentId, offeringId, [
                        ...(item.imageAssets ?? []).map((a) => a.id),
                        uploaded.id,
                      ]);
                    }
                  }
                }} />
              </label>
              <button type="button" className="rounded-md border px-2 text-[12px]" onClick={() => setPhotosOpen(true)}>{copy.t("From portfolio")}</button>
            </div>
          </div>
          <label className="block text-[12px] font-semibold">
            {copy.t("How the price works")}
            <select className="mt-1 w-full rounded-md border px-2 py-2" value={item.priceDisplay} onChange={(e) => patch({ priceDisplay: e.target.value as TalentOffering["priceDisplay"] })}>
              <option value="exact">{copy.t("Fixed price")}</option>
              <option value="from">{copy.t("Starting at")}</option>
              <option value="quote">{copy.t("Quote each time")}</option>
            </select>
          </label>
          <label className="block text-[12px] font-semibold">
            {copy.t("Category")}
            <input className="mt-1 w-full rounded-md border px-2 py-2" maxLength={80} value={item.category ?? ""} onChange={(e) => patch({ category: e.target.value || null })} list="service-categories" />
            <datalist id="service-categories">
              {Array.from(new Set(items.map((i) => i.category).filter(Boolean))).map((c) => (
                <option key={c as string} value={c as string} />
              ))}
            </datalist>
          </label>
          {item.priceDisplay !== "quote" && (
            <label className="block text-[12px] font-semibold">
              {copy.t("Price")}
              <input type="number" className="mt-1 w-full rounded-md border px-2 py-2" value={item.amountCents != null ? item.amountCents / 100 : ""} onChange={(e) => patch({ amountCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} />
            </label>
          )}
          {item.kind !== "product" && (
            <label className="block text-[12px] font-semibold">
              {copy.t("How long it takes")}
              <input type="number" className="mt-1 w-full rounded-md border px-2 py-2" value={item.durationMinutes ?? ""} onChange={(e) => patch({ durationMinutes: e.target.value ? Number(e.target.value) : null })} />
            </label>
          )}
          {item.kind === "product" && (
            <label className="block text-[12px] font-semibold">
              {copy.t("How many do you have?")}
              <input type="number" className="mt-1 w-full rounded-md border px-2 py-2" value={item.inventoryQty ?? ""} onChange={(e) => patch({ inventoryQty: e.target.value ? Number(e.target.value) : null })} />
            </label>
          )}
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">{copy.t("How clients buy it")}</h2>
          {(["instant", "request"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => patch({ bookingMode: mode })} className={`block w-full rounded-xl border px-3 py-2 text-left ${item.bookingMode === mode ? "border-admin-brand" : "border-admin-border-soft"}`}>
              {mode === "instant" ? copy.t("Instant booking") : copy.t("Request to book")}
            </button>
          ))}
          <button type="button" onClick={() => patch({ priceDisplay: "quote", bookingMode: "request" })} className={`block w-full rounded-xl border px-3 py-2 text-left ${item.priceDisplay === "quote" ? "border-admin-brand" : "border-admin-border-soft"}`}>
            {copy.t("Request a quote")}
          </button>
          <p className="text-[12px] text-admin-ink-muted">
            {copy.t("Deposit")}: {copy.t("Uses your default:")} {defaults?.depositPct ?? 0}% · {copy.t("Cancelling")}: {defaults?.cancelHours ?? 24} h
          </p>
        </section>

        {item.kind === "service" && (
          <section className="mt-8">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">{copy.t("Options and extras")}</h2>
            <p className="mt-1 text-[12px] text-admin-ink-muted">{copy.t("Create once, attach to many")}</p>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 rounded-md border px-2 py-1" value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder={copy.t("Extra name")} />
              <button
                type="button"
                className="rounded-full bg-admin-ink px-3 py-1 text-[12px] text-white"
                onClick={async () => {
                  await upsertAddonGroup(talentId, {
                    name: extraName,
                    amountCents: 0,
                    durationMinutes: null,
                    offeringIds: item.id ? [item.id] : [],
                  });
                  setExtraName("");
                  await onRefreshAddons();
                }}
              >
                {copy.t("Add an extra")}
              </button>
            </div>
            <ul className="mt-2 text-[13px]">
              {addons.filter((g) => !item.id || g.offeringIds.includes(item.id)).map((g) => (
                <li key={g.id}>{g.name}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="rounded-2xl border border-admin-border-soft bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{copy.t("What the client sees")}</p>
        <OfferingCard item={item} locale={locale} rates={rates} />
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em]">{copy.t("Ready to publish?")}</p>
        <p className="mt-1 text-[13px]">{ready ? copy.t("Yes") : copy.t("No")}. {ready ? copy.t("Sold at a fixed price, so it needs a price and a length. It has both.") : copy.t("Add a name, a price or quote, and a length.")}</p>
      </aside>

      {preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={() => setPreview(false)}>
          <div className="w-full max-w-[480px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-admin-display text-[22px]">{copy.t("Preview as customer")}</h2>
            <ul className="mt-3 space-y-2 text-[13px]">
              {destinations.map((d) => (
                <li key={d.id}>
                  {d.label} · {copy.t("Who gets the enquiry")}: {d.enquiryTo}
                  {d.href && (
                    <a className="ml-2 underline" href={d.href} target="_blank" rel="noreferrer">{copy.t("Open live page")}</a>
                  )}
                </li>
              ))}
            </ul>
            <OfferingCard item={item} locale={locale} rates={rates} />
            <button type="button" className="mt-3" onClick={() => setPreview(false)}>{copy.t("Back")}</button>
          </div>
        </div>
      )}

      {photosOpen && (
        <PortfolioSheet talentId={talentId} item={item} onClose={() => setPhotosOpen(false)} onAttached={() => setPhotosOpen(false)} />
      )}
    </div>
  );
}

function PortfolioSheet({
  talentId,
  item,
  onClose,
  onAttached,
}: {
  talentId: string;
  item: TalentOffering;
  onClose: () => void;
  onAttached: () => void;
}) {
  const copy = useDashboardText();
  const [photos, setPhotos] = useState<PortfolioPhoto[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useMemo(() => {
    void listTalentPortfolioPhotos(talentId).then((res) => {
      if (res.ok) setPhotos(res.photos);
    });
  }, [talentId]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 md:items-center" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-[640px] overflow-auto rounded-t-2xl bg-white p-5 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-admin-display text-[22px]">{copy.t("From portfolio")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(photos ?? []).map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setPicked((cur) => (cur.includes(photo.id) ? cur.filter((id) => id !== photo.id) : [...cur, photo.id]))}
              className={`overflow-hidden rounded-md border ${picked.includes(photo.id) ? "border-admin-brand" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 rounded-full bg-admin-brand px-4 py-2 text-white"
          onClick={async () => {
            if (item.id) await setOfferingImages(talentId, item.id, picked);
            onAttached();
          }}
        >
          {copy.t("Save changes")}
        </button>
      </div>
    </div>
  );
}

export function AddManyScreen({
  talentId,
  editor,
  onBack,
}: {
  talentId: string;
  editor: ReturnType<typeof useOfferingsEditor>;
  onBack: () => void;
}) {
  const copy = useDashboardText();
  const [text, setText] = useState("");
  const parsed = text.split(/\n+/).map(parseOfferingLine).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return (
    <div className="max-w-[720px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[26px]">{copy.t("Add many")}</h1>
      <textarea className="mt-3 h-40 w-full rounded-md border p-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Gel semi pies 600" />
      <table className="mt-3 w-full text-left text-[13px]">
        <thead><tr><th>{copy.t("Name")}</th><th>{copy.t("Price")}</th><th>{copy.t("Status")}</th></tr></thead>
        <tbody>
          {parsed.map((row) => {
            const exists = editor.items.some((i) => foldAccent(i.title) === foldAccent(row.title));
            return (
              <tr key={row.title}>
                <td>{row.title}</td>
                <td>{row.amountCents != null ? row.amountCents / 100 : "—"}</td>
                <td>{exists ? copy.t("Already exists · skip") : row.durationMinutes ? copy.t("Ready") : copy.t("Needs minutes")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-full bg-admin-brand px-4 py-2 text-white"
          onClick={async () => {
            for (const row of parsed) {
              if (editor.items.some((i) => foldAccent(i.title) === foldAccent(row.title))) continue;
              if (row.amountCents == null) continue;
              editor.startAdd({
                kind: row.kind,
                title: row.title,
                amountCents: row.amountCents,
                durationMinutes: row.durationMinutes,
                status: "published",
                bookingMode: "instant",
                priceDisplay: "exact",
              });
              await editor.saveDraft({ status: "published" });
            }
            onBack();
          }}
        >
          {copy.t("Publish the N that are ready").replace("N", String(parsed.filter((r) => r.amountCents != null && !editor.items.some((i) => foldAccent(i.title) === foldAccent(r.title))).length))}
        </button>
        <button type="button" onClick={() => void importLegacyToOfferings(talentId)}>{copy.t("Import my old rates & packages")}</button>
      </div>
      <button type="button" disabled className="mt-4 block text-[12px] text-admin-ink-muted">{copy.t("Photo of a card")} · {copy.t("Later phase")}</button>
    </div>
  );
}

export function CameraAddScreen({
  talentId,
  editor,
  onBack,
  locale,
}: {
  talentId: string;
  editor: ReturnType<typeof useOfferingsEditor>;
  onBack: () => void;
  locale: string;
}) {
  const copy = useDashboardText();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <div className="max-w-[420px] font-admin-body">
      <button type="button" onClick={onBack}>{copy.t("Back")}</button>
      <h1 className="mt-2 font-admin-display text-[26px]">{copy.t("Add item")}</h1>
      <label className="mt-4 block text-[12px] font-semibold">
        {copy.t("Photo")}
        <input type="file" accept="image/*" capture="environment" className="mt-1 block" />
      </label>
      <input className="mt-3 w-full rounded-md border px-2 py-2" placeholder={copy.t("Name")} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="mt-2 w-full rounded-md border px-2 py-2" placeholder={copy.t("Price")} value={price} onChange={(e) => setPrice(e.target.value)} />
      <input className="mt-2 w-full rounded-md border px-2 py-2" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      <button
        type="button"
        className="mt-4 rounded-full bg-admin-brand px-4 py-2 text-white"
        onClick={async () => {
          editor.startAdd({
            title,
            amountCents: price ? Math.round(Number(price) * 100) : null,
            durationMinutes: minutes ? Number(minutes) : null,
            status: "published",
            bookingMode: "instant",
            currency: editor.defaultCurrency,
          });
          await editor.saveDraft({ status: "published" });
          onBack();
        }}
      >
        {copy.t("Publish now")}
      </button>
      <p className="mt-2 text-[11px] text-admin-ink-muted">{locale}</p>
      <p className="sr-only">{talentId}</p>
    </div>
  );
}
