"use client";

/**
 * TUL-1270 #10 review: staff path to a roster talent's services in the profile
 * drawer, now on the CURRENT editor (EditorScreen, en + es) instead of the
 * retired English-only manager. Same permission as before: every load and save
 * goes through authorizeForTalent (the talent, or staff of a workspace that has
 * the talent on its roster); without it the load fails and nothing renders but
 * a note. Editing only: defaults, extras and destinations stay the talent's
 * own (their actions are owner-only), so the editor opens without them.
 */
import { useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { loadTalentOfferingsForEditor, setOfferingImages, upsertTalentOffering } from "@/lib/talent/offerings-actions";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { publicationLabel, publicationWord } from "@/lib/talent/publication-state";
import { listPrice } from "@/lib/talent/services-list-price";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";

import { EditorScreen } from "./EditorScreen";
import { resolveOfferingEditorSaveStatus } from "./offering-editor-save";

const COPY = {
  en: { loading: "Loading services…", none: "No services yet.", denied: "You do not have access to this talent's services.", quoted: "Quoted", noPrice: "No price yet" },
  es: { loading: "Cargando servicios…", none: "Todavía no hay servicios.", denied: "No tienes acceso a los servicios de este talento.", quoted: "A cotizar", noPrice: "Sin precio" },
} as const;

export function StaffServicesPanel({ talentId }: { talentId: string }) {
  const copy = useDashboardText();
  const locale = copy.isSpanish ? "es" : "en";
  const t = copy.isSpanish ? COPY.es : COPY.en;
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");
  const [items, setItems] = useState<TalentOffering[]>([]);
  const [rates, setRates] = useState<UsdRates | null>(null);
  const [editing, setEditing] = useState<TalentOffering | null>(null);

  useEffect(() => {
    let live = true;
    void loadTalentOfferingsForEditor(talentId).then((res) => {
      if (!live) return;
      if (!res.ok) return setState("denied");
      setItems(res.items);
      setRates(res.usdRates);
      setState("ready");
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  if (state === "loading") return <p className="mt-3 text-[13px] text-admin-ink-dim">{t.loading}</p>;
  if (state === "denied") return <p className="mt-3 text-[13px] text-admin-ink-dim">{t.denied}</p>;

  if (editing) {
    return (
      <div className="mt-3" data-staff-services-editor>
        <EditorScreen
          item={editing}
          setItem={setEditing}
          locale={locale}
          defaults={null}
          destinations={[]}
          addons={[]}
          items={items}
          talentId={talentId}
          rates={rates}
          onBack={() => setEditing(null)}
          onRefreshAddons={async () => {}}
          onSave={async (next, publish, pendingImageIds) => {
            const payload: TalentOffering = {
              ...next,
              status: resolveOfferingEditorSaveStatus({ publish, offeringId: next.id, currentStatus: next.status }),
            };
            const res = await upsertTalentOffering(talentId, payload);
            if (!res.ok) throw new Error(res.error);
            if (pendingImageIds?.length) await setOfferingImages(talentId, res.item.id, pendingImageIds);
            setItems((cur) => cur.map((it) => (it.id === res.item.id ? res.item : it)));
            setEditing(res.item);
          }}
        />
      </div>
    );
  }

  if (items.length === 0) return <p className="mt-3 text-[13px] text-admin-ink-dim">{t.none}</p>;
  return (
    <ul className="mt-3 divide-y divide-admin-border-soft rounded-xl border border-admin-border-soft bg-white" data-staff-services>
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => setEditing(it)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-admin-ink">{it.title}</span>
              <span className="block text-[12px] text-admin-ink-dim">{publicationLabel(publicationWord(it), locale)}</span>
            </span>
            <span className="shrink-0 text-[13px] text-admin-ink">{listPrice(it, t.quoted, t.noPrice, locale)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
