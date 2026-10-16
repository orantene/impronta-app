/**
 * Content inspector for the `promo` block (TUL-1051 part B).
 *
 * Progressive: the look and the offer first; words next; who/when/where and the
 * pop-up options sit in "More options" so a talent can drop the block in, pick a
 * look, and be done. Every control writes a prop `promoPropsSchema` accepts
 * (numbers are clamped to the schema range before they are committed).
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CHIP_HREF_RE } from "@/lib/site-admin/builder-node/next-free-chip-href";
import type { BuilderPromoNode } from "@/lib/site-admin/builder-node/types";
import {
  PROMO_WIDGET_FREQUENCIES,
  PROMO_WIDGET_POSITIONS,
  PROMO_WIDGET_TONES,
  PROMO_WIDGET_VARIANTS,
  type PromoWidgetAudience,
  type PromoWidgetFrequency,
  type PromoWidgetPagesMode,
  type PromoWidgetPosition,
  type PromoWidgetTone,
  type PromoWidgetVariant,
} from "@/lib/promos/widgets/types";

import { KIT, InspectorLabelWithInfo } from "./kit";
import { useInspectorT } from "./kit/use-inspector-t";

type CommitPatch = (patch: Record<string, unknown>) => void;

export const PROMO_VARIANT_LABELS: Record<PromoWidgetVariant, string> = {
  banner: "Banner",
  cards: "Offer cards",
  reveal: "Reveal code",
  countdown: "Countdown",
  popup: "Pop-up",
  sticky: "Floating button",
  book: "Book button",
};

const AUDIENCE_LABELS: Record<PromoWidgetAudience, string> = {
  everyone: "Everyone",
  new: "First-time visitors",
  returning: "Returning visitors",
  signed_in: "Signed-in clients",
  guest: "Guests",
};

const PAGES_LABELS: Record<PromoWidgetPagesMode, string> = {
  all: "All pages",
  only: "Only these pages",
  except: "All except these pages",
};

const FREQUENCY_LABELS: Record<PromoWidgetFrequency, string> = {
  always: "Every visit",
  session: "Once per visit",
  once: "Once ever",
  daily: "Once a day",
  weekly: "Once a week",
};

const POSITION_LABELS: Record<PromoWidgetPosition, string> = {
  bottom_right: "Bottom right",
  bottom_left: "Bottom left",
  bottom_center: "Bottom center",
};

const TONE_LABELS: Record<PromoWidgetTone, string> = {
  accent: "Accent",
  ink: "Dark",
  soft: "Soft",
};

type PromoChoice = { id: string; label: string };

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  const { t } = useInspectorT();
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : t(title)}</h3>
      {children}
    </section>
  );
}

function Chips<T extends string>({
  value,
  options,
  labels,
  onPick,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onPick: (v: T) => void;
}) {
  const { t } = useInspectorT();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          className={
            value === id
              ? "rounded-md border border-stone-800 bg-stone-800 px-2.5 py-1.5 text-[12px] text-white"
              : "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
          }
          onClick={() => onPick(id)}
        >
          {t(labels[id])}
        </button>
      ))}
    </div>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const { t } = useInspectorT();
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{t(label)}</label>
      <select className={KIT.input} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>{t(labels[o])}</option>
        ))}
      </select>
    </div>
  );
}

function Text({
  label,
  value,
  placeholder,
  max,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  max: number;
  onChange: (v: string) => void;
}) {
  const { to, t } = useInspectorT();
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{t(label)}</label>
      <input className={KIT.input} value={value} placeholder={to(placeholder)} maxLength={max} onChange={(e) => onChange(e.target.value.slice(0, max))} />
    </div>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/;

/** Keeps what the talent is typing; only a complete date (or empty) reaches the draft. */
function DateField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  onCommit: (v: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = draft !== "" && !DATE_RE.test(draft);
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{t(label)}</label>
      <input
        className={KIT.input}
        value={draft}
        placeholder={placeholder}
        maxLength={16}
        aria-invalid={bad}
        onChange={(e) => {
          const v = e.target.value.trim().slice(0, 16);
          setDraft(v);
          if (v === "") onCommit(undefined);
          else if (DATE_RE.test(v)) onCommit(v);
        }}
      />
    </div>
  );
}

function Num({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const { t } = useInspectorT();
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{t(label)}</label>
      <div className="flex items-center gap-2">
        <input
          className={KIT.input}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Math.trunc(Number(e.target.value));
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
        />
        <span className="text-[12px] text-stone-500">{t(suffix)}</span>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useInspectorT();
  return (
    <label className="flex items-center gap-2 text-[13px] text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t(label)}
    </label>
  );
}

/** The talent's own promos, for the picker. A failed read leaves only "Best live promo". */
function usePromoChoices(): PromoChoice[] {
  const [choices, setChoices] = useState<PromoChoice[]>([]);
  useEffect(() => {
    let live = true;
    // Loaded on demand: a static import of a "use server" module would drag server code into the editor bundle.
    void import("@/lib/promos/actions")
      .then((m) => m.loadPromosPage())
      .then((res) => {
        if (!live || !res.ok) return;
        setChoices(
          res.data.promos
            .filter((p) => p.status === "live" || p.status === "scheduled")
            .map((p) => ({ id: p.id, label: p.name })),
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return choices;
}

export function PromoContentInspector({ node, commitPatch }: { node: BuilderPromoNode; commitPatch: CommitPatch }) {
  const p = node.props;
  const variant = p.variant ?? "banner";
  const choices = usePromoChoices();
  const { t } = useInspectorT();
  const popup = variant === "popup";
  const dismissible = variant === "banner" || variant === "sticky";

  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="promo" data-promo-inspector="content">
      <Section title="Look" info="One block, seven looks. It shows one of your live promos and stays hidden when you have none.">
        <Chips value={variant} options={PROMO_WIDGET_VARIANTS} labels={PROMO_VARIANT_LABELS} onPick={(v) => commitPatch({ variant: v })} />
        <Chips value={p.tone ?? "accent"} options={PROMO_WIDGET_TONES} labels={TONE_LABELS} onPick={(v) => commitPatch({ tone: v })} />
      </Section>

      <Section title="Offer" info="Pick one of your promos, or let the block show your best live promo.">
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Promo")}</label>
          <select className={KIT.input} value={p.promoId ?? ""} onChange={(e) => commitPatch({ promoId: e.target.value || undefined })}>
            <option value="">{t("Best live promo")}</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
            {p.promoId && !choices.some((c) => c.id === p.promoId) ? <option value={p.promoId}>{t("Selected promo")}</option> : null}
          </select>
        </div>
        {variant === "cards" ? (
          <Num label="Cards to show" value={p.maxCards ?? 3} min={1} max={6} suffix="max" onChange={(v) => commitPatch({ maxCards: v })} />
        ) : null}
      </Section>

      <Section title="Words" info="Leave empty to use the default text in your site language.">
        <Text label="Headline" value={p.headline ?? ""} placeholder="Get 20% off" max={80} onChange={(v) => commitPatch({ headline: v || undefined })} />
        <Text label="Details" value={p.body ?? ""} max={200} onChange={(v) => commitPatch({ body: v || undefined })} />
        <Text label="Button label" value={p.ctaLabel ?? ""} placeholder="Book with this offer" max={40} onChange={(v) => commitPatch({ ctaLabel: v || undefined })} />
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Button goes to")}</label>
          <input
            className={KIT.input}
            value={p.ctaHref ?? ""}
            placeholder="#services"
            maxLength={200}
            onChange={(e) => {
              const next = e.target.value.trim().slice(0, 200);
              // Only a same-page anchor or a site path passes the schema; anything else stays out of the draft.
              if (next === "" || CHIP_HREF_RE.test(next)) commitPatch({ ctaHref: next || undefined });
            }}
          />
        </div>
        {dismissible ? <Check label="Let visitors close it" checked={p.dismissible !== false} onChange={(v) => commitPatch({ dismissible: v })} /> : null}
      </Section>

      <details className="rounded-md border border-stone-200 p-3">
        <summary className="cursor-pointer text-[13px] font-medium text-stone-800">{t("More options")}</summary>
        <div className="mt-3 flex flex-col gap-4">
          {popup ? (
            <Section title="Pop-up" info="It opens on the first trigger that fires. Leave all three empty to open right away.">
              <Chips
                value={p.popupStyle ?? "modal"}
                options={["modal", "slide"] as const}
                labels={{ modal: "Centered", slide: "Slide in" }}
                onPick={(v) => commitPatch({ popupStyle: v })}
              />
              <Num label="After" value={p.delaySec ?? 8} min={0} max={120} suffix="seconds" onChange={(v) => commitPatch({ delaySec: v })} />
              <Num label="After scrolling" value={p.scrollPct ?? 0} min={0} max={100} suffix="% (0 = off)" onChange={(v) => commitPatch({ scrollPct: v })} />
              <Check label="When the visitor is about to leave (desktop)" checked={p.exitIntent === true} onChange={(v) => commitPatch({ exitIntent: v })} />
              <Pick label="How often" value={p.frequency ?? "session"} options={PROMO_WIDGET_FREQUENCIES} labels={FREQUENCY_LABELS} onChange={(v) => commitPatch({ frequency: v })} />
              {p.popupStyle === "slide" ? (
                <Pick label="Position" value={p.position ?? "bottom_right"} options={PROMO_WIDGET_POSITIONS} labels={POSITION_LABELS} onChange={(v) => commitPatch({ position: v })} />
              ) : null}
            </Section>
          ) : null}
          {variant === "sticky" ? (
            <Pick label="Position" value={p.position ?? "bottom_right"} options={PROMO_WIDGET_POSITIONS} labels={POSITION_LABELS} onChange={(v) => commitPatch({ position: v })} />
          ) : null}

          <Section title="Who sees it" info="A display rule only. The price a client pays is still decided when they book.">
            <Pick
              label="Audience"
              value={p.audience ?? "everyone"}
              options={["everyone", "new", "returning", "signed_in", "guest"] as const}
              labels={AUDIENCE_LABELS}
              onChange={(v) => commitPatch({ audience: v })}
            />
          </Section>

          <Section title="When" info="Optional dates, in your promo's time zone. Empty means the promo's own dates.">
            <DateField label="From (YYYY-MM-DD)" value={p.startsAt ?? ""} placeholder="2026-10-31" onCommit={(v) => commitPatch({ startsAt: v })} />
            <DateField label="Until (YYYY-MM-DD)" value={p.endsAt ?? ""} placeholder="2026-11-05" onCommit={(v) => commitPatch({ endsAt: v })} />
          </Section>

          <Section title="Where" info="Pick the pages by their path, one per line. / is your home page and /menu/* covers everything under it.">
            <Pick label="Show on" value={p.pagesMode ?? "all"} options={["all", "only", "except"] as const} labels={PAGES_LABELS} onChange={(v) => commitPatch({ pagesMode: v })} />
            {(p.pagesMode ?? "all") !== "all" ? (
              <div className={KIT.field}>
                <label className={KIT.label}>{t("Pages")}</label>
                <textarea
                  className={KIT.input}
                  rows={3}
                  value={p.pages ?? ""}
                  placeholder={"/\n/services"}
                  maxLength={500}
                  onChange={(e) => commitPatch({ pages: e.target.value.slice(0, 500) || undefined })}
                />
              </div>
            ) : null}
          </Section>
        </div>
      </details>
    </div>
  );
}
