"use client";

/**
 * ItemsPickerSheet (L5, boards D05 desktop sheet 520, M03 mobile h92, D17
 * availability, D21 tables and tickets): "Add items to this conversation".
 * One list across every category the business sells (talent, packages,
 * services, classes, tickets, tables, menu), search, category chips in the
 * business's order, availability for the thread's date, a Custom line, and
 * the three ways to send (D05 "How to send"):
 *
 *   As an offer to accept   -> shared draft + lines, then `create_offer`
 *   Send choices            -> `messagingSendOptions`, one card per kind
 *   Add to the shared draft -> shared draft + lines, nothing posted
 *
 * `ItemsPickerView` is pure over its props (every phase reachable by a
 * render test); `ItemsPickerSheet` is the stateful wrapper the registry
 * mounts (`registerActionSheet("add_items")`), owning the catalog load and
 * the send plan (`sendModeToEngineCall` -> `runSendPlan`). Owner rulings:
 * choices never book, "client" never "customer", no em dashes, USD.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCentsUSD } from "@/lib/bookings/commission";
import {
  categoryOrderForPreset,
  filterCatalog,
  groupCatalog,
  holdRefusal,
  isSelectable,
  lineAmountCents,
  plannedCardKinds,
  selectionTotal,
  sendModeToEngineCall,
  type CatalogRow,
  type CustomLine,
  type EngineCall,
  type ItemCategory,
  type SendMode,
  type Selection,
} from "@/lib/messages-v5/items-picker";
import type { ItemsCatalog } from "@/lib/messages-v5/items-catalog";
import type { MessagingRefusal } from "@/lib/messaging/types";

import { fill, type KitCopy } from "../../kit/copy";
import { OptionRow } from "../../kit/OptionRow";
import { Avatar, Btn, Chip, Icon, Pill, type IconName } from "../../kit/primitives";
import { OkLine, RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import { EmptyState, Skeleton } from "../../kit/Skeleton";
import type { ScreenVariant } from "../contracts";
import { registerActionSheet, type ActionSheetProps } from "../sheet-registry";
import { engineItemsActions, runSendPlan, type ItemsActions } from "./items-actions";
import { TimesSheet } from "./TimesSheet";

export type ItemsPickerPhase = "loading" | "ready" | "busy" | "refused" | "done" | "failed";

const CATEGORY_ICON: Record<ItemCategory, IconName> = {
  talent: "user",
  package: "pkg",
  service: "tag",
  class: "users",
  ticket: "ticket",
  table: "table",
  menu: "bag",
};

function formatDay(ymd: string | null): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

function formatStart(iso: string | undefined, timezone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** The second line of a row: when, seats, and the busy reason when there is one. */
export function rowSub(row: CatalogRow, copy: KitCopy, date: string | null, timezone: string): string | null {
  const parts: string[] = [];
  const when = formatStart(row.startsAt, timezone);
  if (when) parts.push(when);
  if (row.sub) parts.push(row.sub);
  if (row.availability.kind === "busy") {
    const reason = row.availability.reason;
    parts.push(`${copy.items.busy} ${reason === "booked" ? fill(copy.items.busyReason.booked, { date: formatDay(date) }) : copy.items.busyReason[reason]}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export type ItemsPickerViewProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly clientName: string | null;
  readonly phase: ItemsPickerPhase;
  readonly catalog: ItemsCatalog | null;
  readonly refusal: MessagingRefusal | null;
  readonly query: string;
  readonly category: ItemCategory | "all";
  readonly selected: readonly Selection[];
  readonly custom: CustomLine | null;
  readonly customOpen: boolean;
  readonly mode: SendMode;
  /** A sentence blocking the send (a seam), or null. */
  readonly seam: string | null;
  readonly onQuery: (q: string) => void;
  readonly onCategory: (c: ItemCategory | "all") => void;
  readonly onToggle: (row: CatalogRow) => void;
  readonly onTier: (row: CatalogRow, variantId: string) => void;
  readonly onUnits: (row: CatalogRow, units: number) => void;
  readonly onCustomOpen: (open: boolean) => void;
  readonly onCustom: (line: CustomLine | null) => void;
  readonly onMode: (m: SendMode) => void;
  readonly onSend: () => void;
};

export function ItemsPickerView(p: ItemsPickerViewProps) {
  const { copy, variant } = p;
  const c = copy.items;
  const mobile = variant === "mobile";
  const timezone = p.catalog?.timezone ?? "UTC";
  const order = useMemo(() => categoryOrderForPreset(p.catalog?.preset ?? null), [p.catalog?.preset]);
  const catalogRows = p.catalog?.rows;
  const rows = useMemo(() => catalogRows ?? [], [catalogRows]);
  const groups = useMemo(() => groupCatalog(filterCatalog(rows, p.query, p.category), order), [rows, p.query, p.category, order]);
  const present = useMemo(() => new Set(groupCatalog(rows, order).map((g) => g.category)), [rows, order]);
  const total = selectionTotal(p.selected, p.custom);
  const selectedIds = useMemo(() => new Map(p.selected.map((s) => [s.row.id, s])), [p.selected]);
  const busy = p.phase === "busy";
  const totalLabel = total.count === 0 ? c.none : fill(total.partial ? c.selectedPartial : c.selected, { count: total.count, total: formatCentsUSD(total.totalCents) });
  const sendLabel = p.mode === "offer" ? c.continueOffer : p.mode === "choices" ? c.sendChoices : c.addToDraft;
  const canSend = p.phase === "ready" && total.count > 0 && !p.seam;

  const chips = (
    <div className={mobile ? "mx-chips" : "chips"} data-items-chips>
      <Chip on={p.category === "all"} onClick={() => p.onCategory("all")}>
        {c.all}
      </Chip>
      {order.filter((cat) => present.has(cat)).map((cat) => (
        <Chip key={cat} on={p.category === cat} onClick={() => p.onCategory(cat)}>
          {c.cat[cat]}
        </Chip>
      ))}
    </div>
  );

  const search = (
    <label className={mobile ? "mx-search inset" : "search"} data-items-search>
      <Icon name="search" size={mobile ? 16 : 14} />
      <input type="search" value={p.query} placeholder={c.search} onChange={(e) => p.onQuery(e.target.value)} disabled={busy} aria-label={c.search} />
    </label>
  );

  const dateLine = p.catalog ? <div className={mobile ? "mx-gh" : "lbl"} data-items-date>{p.catalog.date ? fill(c.availableOn, { date: formatDay(p.catalog.date) }) : c.noDate}</div> : null;

  const list =
    p.phase === "loading" ? (
      <Skeleton rows={5} variant={variant} copy={copy} />
    ) : p.phase === "failed" ? (
      <EmptyState icon="alert" title={c.failedTitle} body={copy.inbox.empty.failedBody} variant={variant} />
    ) : rows.length === 0 ? (
      <EmptyState icon="bag" title={c.emptyTitle} body={c.emptyBody} variant={variant} />
    ) : (
      <div className={mobile ? "mx-items-list" : "items-list"} data-items-list>
        {groups.map((g) => (
          <div key={g.category} data-items-group={g.category}>
            {p.category === "all" ? <div className={mobile ? "mx-gh" : "lbl"}>{c.cat[g.category]}</div> : null}
            {g.rows.map((row) => {
              const sel = selectedIds.get(row.id) ?? null;
              const selectable = isSelectable(row);
              const amount = sel ? lineAmountCents(sel) : row.amountCents;
              return (
                <div key={row.id} data-items-row={row.id} data-availability={row.availability.kind}>
                  <OptionRow
                    control="check"
                    variant={variant}
                    selected={sel !== null}
                    disabled={!selectable || busy}
                    title={row.title}
                    sub={rowSub(row, copy, p.catalog?.date ?? null, timezone)}
                    amount={amount == null ? null : formatCentsUSD(amount)}
                    leading={row.category === "talent" ? <Avatar name={row.title} size={mobile ? "lg" : "sm"} /> : <Avatar name={null} icon={CATEGORY_ICON[row.category]} size={mobile ? "lg" : "sm"} />}
                    trailing={!selectable ? <Pill tone="lost">{c.busy}</Pill> : null}
                    onSelect={selectable ? () => p.onToggle(row) : undefined}
                  />
                  {sel && row.category === "ticket" && row.tiers && row.tiers.length > 0 ? (
                    <div className="split" data-items-tier>
                      <div className="fld">
                        <label htmlFor={`tier-${row.id}`}>{c.tier}</label>
                        <select id={`tier-${row.id}`} className="in" value={sel.variantId ?? ""} disabled={busy} onChange={(e) => p.onTier(row, e.target.value)}>
                          {row.tiers.map((t) => (
                            <option key={t.variantId} value={t.variantId} disabled={t.seatsLeft !== null && t.seatsLeft <= 0}>
                              {t.label} · {formatCentsUSD(t.amountCents)}
                              {t.seatsLeft == null ? "" : ` · ${fill(c.left, { count: t.seatsLeft })}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="fld">
                        <label htmlFor={`units-${row.id}`}>{c.units}</label>
                        <input id={`units-${row.id}`} className="in" type="number" min={1} max={50} value={sel.units} disabled={busy} onChange={(e) => p.onUnits(row, Number(e.target.value))} />
                      </div>
                    </div>
                  ) : sel && (row.category === "menu" || row.category === "class") ? (
                    <div className="fld" data-items-units>
                      <label htmlFor={`units-${row.id}`}>{c.units}</label>
                      <input id={`units-${row.id}`} className="in" type="number" min={1} max={50} value={sel.units} disabled={busy} onChange={(e) => p.onUnits(row, Number(e.target.value))} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        <div data-items-custom>
          <OptionRow
            control="check"
            variant={variant}
            selected={p.custom !== null}
            disabled={busy}
            title={c.custom}
            sub={c.customSub}
            amount={p.custom ? formatCentsUSD(p.custom.amountCents) : null}
            leading={<Avatar name={null} icon="sparkle" size={mobile ? "lg" : "sm"} />}
            onSelect={() => {
              if (p.custom) p.onCustom(null);
              p.onCustomOpen(!p.customOpen && !p.custom);
            }}
          />
          {p.customOpen ? <CustomLineFields copy={copy} busy={busy} onCustom={(line) => { p.onCustom(line); p.onCustomOpen(false); }} /> : null}
        </div>
      </div>
    );

  const modes = p.phase === "loading" || p.phase === "failed" || rows.length === 0 ? null : (
    <div className={mobile ? "mx-items-modes" : "items-modes"} data-items-modes>
      <div className={mobile ? "mx-gh" : "lbl"}>{c.howToSend}</div>
      <OptionRow variant={variant} selected={p.mode === "offer"} title={c.modeOffer} sub={c.modeOfferSub} disabled={busy} onSelect={() => p.onMode("offer")} />
      <OptionRow variant={variant} selected={p.mode === "choices"} title={c.modeChoices} sub={c.modeChoicesSub} disabled={busy} onSelect={() => p.onMode("choices")} />
      <OptionRow variant={variant} selected={p.mode === "draft"} title={c.modeDraft} sub={c.modeDraftSub} disabled={busy} onSelect={() => p.onMode("draft")} />
    </div>
  );

  const status =
    p.phase === "refused" && p.refusal ? (
      <RefusalLine code={p.refusal} copy={copy} variant={variant} />
    ) : p.phase === "done" ? (
      <OkLine text={p.mode === "offer" ? c.doneOffer : p.mode === "choices" ? c.doneChoices : c.doneDraft} variant={variant} />
    ) : p.seam ? (
      <div className={mobile ? "mx-line warn mx-items-line" : "alertline"} role="status" data-items-seam>
        <Icon name="alert" size={14} />
        {p.seam}
      </div>
    ) : null;

  const footer = mobile ? (
    <Btn variant="primary" size="xl" fill busy={busy} disabled={!canSend} onClick={p.onSend} data-items-send>
      {busy ? c.sending : `${sendLabel} · ${totalLabel}`}
    </Btn>
  ) : (
    <>
      <span className="hint" data-items-total>
        {totalLabel}
      </span>
      <Btn onClick={p.onClose} disabled={busy}>
        {copy.sheet.cancel}
      </Btn>
      <Btn variant="primary" busy={busy} disabled={!canSend} onClick={p.onSend} data-items-send>
        {busy ? c.sending : sendLabel}
      </Btn>
    </>
  );

  return (
    <Sheet open={p.open} title={mobile ? c.titleShort : c.title} copy={copy} onClose={p.onClose} variant={mobile ? "mobile-h92" : "desktop"} width={520} avatarName={mobile ? undefined : p.clientName} tight={mobile} footer={footer}>
      <div className="msgv5" data-items-picker data-phase={p.phase}>
        {search}
        {chips}
        {dateLine}
        {list}
        {modes}
        {status}
      </div>
    </Sheet>
  );
}

function CustomLineFields({ copy, busy, onCustom }: { copy: KitCopy; busy: boolean; onCustom: (line: CustomLine) => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const cents = Math.round(Number(amount) * 100);
  const valid = label.trim().length > 0 && Number.isFinite(cents) && cents >= 0;
  return (
    <div className="split" data-items-custom-fields>
      <div className="fld">
        <label htmlFor="msgv5-custom-label">{copy.items.customLabel}</label>
        <input id="msgv5-custom-label" className="in" value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
      </div>
      <div className="fld">
        <label htmlFor="msgv5-custom-amount">{copy.items.customAmount}</label>
        <input id="msgv5-custom-amount" className="in" inputMode="decimal" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Btn size="sm" variant="secondary" disabled={!valid || busy} onClick={() => onCustom({ label: label.trim(), amountCents: cents })} selfStart>
        {copy.idCapture.save}
      </Btn>
    </div>
  );
}

/* ------------------------------------------------------------ stateful sheet ------------------------------------------------------------ */

export type ItemsPickerSheetProps = ActionSheetProps & { readonly actions?: ItemsActions };

export function ItemsPickerSheet({ open, onClose, ctx, copy, variant, actions: injected }: ItemsPickerSheetProps) {
  const actions = injected ?? engineItemsActions;
  const inquiryId = ctx.row?.id ?? null;
  const [phase, setPhase] = useState<ItemsPickerPhase>("loading");
  const [catalog, setCatalog] = useState<ItemsCatalog | null>(null);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ItemCategory | "all">("all");
  const [selected, setSelected] = useState<Selection[]>([]);
  const [custom, setCustom] = useState<CustomLine | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [mode, setMode] = useState<SendMode>("offer");

  useEffect(() => {
    if (!open || !inquiryId) return;
    let alive = true;
    setPhase("loading");
    void actions.loadCatalog({ inquiryId }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setPhase("failed");
        return;
      }
      setCatalog(r.catalog);
      setPhase("ready");
    });
    return () => {
      alive = false;
    };
  }, [actions, inquiryId, open]);

  const plan: EngineCall[] = useMemo(() => sendModeToEngineCall({ mode, selected, custom, timezone: catalog?.timezone ?? "UTC" }), [mode, selected, custom, catalog?.timezone]);
  const seamCall = plan.find((c): c is Extract<EngineCall, { action: "seam" }> => c.action === "seam") ?? null;
  const seam = seamCall ? (seamCall.reason === "custom_not_a_choice" ? copy.kit.items.customNotChoice : copy.kit.items.tableSeam) : null;

  const onToggle = useCallback((row: CatalogRow) => {
    setSelected((list) => (list.some((s) => s.row.id === row.id) ? list.filter((s) => s.row.id !== row.id) : [...list, { row, units: 1, variantId: row.tiers?.find((t) => t.seatsLeft == null || t.seatsLeft > 0)?.variantId ?? row.tiers?.[0]?.variantId ?? null }]));
  }, []);

  const onSend = useCallback(async () => {
    if (!inquiryId || phase !== "ready" || seam) return;
    const hold = holdRefusal(ctx.essentials?.customer.identityLevel ?? null, plannedCardKinds(plan));
    if (hold) {
      setRefusal(hold);
      setPhase("refused");
      return;
    }
    setPhase("busy");
    const r = await runSendPlan(plan, actions, { inquiryId, version: ctx.version, newKey: () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) });
    if (!r.ok) {
      setRefusal(r.reason);
      setPhase("refused");
      return;
    }
    setPhase("done");
    ctx.notify({ kind: "ok", text: mode === "offer" ? copy.kit.items.doneOffer : mode === "choices" ? copy.kit.items.doneChoices : copy.kit.items.doneDraft });
    await ctx.reloadThread();
    onClose();
    if (r.dispatched) ctx.dispatch(r.dispatched);
  }, [actions, copy.kit.items, ctx, inquiryId, mode, onClose, phase, plan, seam]);

  return (
    <ItemsPickerView
      open={open}
      onClose={onClose}
      copy={copy.kit}
      variant={variant}
      clientName={ctx.essentials?.customer.name || ctx.row?.contactName || null}
      phase={phase}
      catalog={catalog}
      refusal={refusal}
      query={query}
      category={category}
      selected={selected}
      custom={custom}
      customOpen={customOpen}
      mode={mode}
      seam={seam}
      onQuery={setQuery}
      onCategory={setCategory}
      onToggle={onToggle}
      onTier={(row, variantId) => setSelected((list) => list.map((s) => (s.row.id === row.id ? { ...s, variantId } : s)))}
      onUnits={(row, units) => setSelected((list) => list.map((s) => (s.row.id === row.id ? { ...s, units: Math.max(1, Math.min(50, Math.round(units) || 1)) } : s)))}
      onCustomOpen={setCustomOpen}
      onCustom={setCustom}
      onMode={(m) => {
        setMode(m);
        if (phase === "refused") setPhase("ready");
      }}
      onSend={() => void onSend()}
    />
  );
}

registerActionSheet("add_items", { Component: ItemsPickerSheet, lane: "L5" });
registerActionSheet("send_times", { Component: TimesSheet, lane: "L5" });
