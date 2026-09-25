"use client";

/**
 * GuestDockCatalog — L13 wave 5. The business's catalog inside the dock's
 * Items tab: category chips (only the kinds the tenant sells), rows with price
 * and availability from the same reader the workspace picker uses, and one
 * action per row:
 *
 *   talent           → Add to lineup   (the inquiry cart, existing writer)
 *   priced item      → Add to inquiry  (shared POS draft via messagingClientAddItem,
 *                                       the client's own line until staff confirm)
 *   bookable kinds   → Buy now         (the storefront's own self-serve page)
 *   anything         → Ask             (prefills the composer, no write)
 *
 * A visitor with no inquiry yet gets one on the first add (the panel's
 * ensure path), then the add runs once the thread token arrives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ItemCategory } from "@/lib/messages-v5/items-picker";
import { messagingClientAddItem } from "@/lib/server-actions/messaging-client";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";

import { getGuestItemsCatalog, type GuestCatalogGroup, type GuestCatalogRow } from "../_actions/guest-catalog-actions";
import { FONT, type paletteFor } from "./mini-chat-styles";

type Palette = ReturnType<typeof paletteFor>;

const CATEGORY_KEY: Record<ItemCategory, string> = {
  talent: "public.guestChat.catalogTalent",
  package: "public.guestChat.catalogPackages",
  service: "public.guestChat.catalogServices",
  class: "public.guestChat.catalogClasses",
  ticket: "public.guestChat.catalogTickets",
  table: "public.guestChat.catalogTables",
  menu: "public.guestChat.catalogMenu",
};

/** Kinds with a self-serve storefront page. */
const BUY_HREF: Partial<Record<ItemCategory, string>> = { service: "/book", class: "/book", ticket: "/events" };

export type GuestDockCatalogProps = {
  tenantSlug: string;
  businessName: string;
  locale: string;
  t: Translator;
  C: Palette;
  accent: string;
  accentInk: string;
  inquiryId: string | null;
  threadToken: string | null;
  sourcePage: string;
  /** Creates the early inquiry row when none exists; resolves to its id. */
  onEnsureInquiry: (() => Promise<string | null>) | null;
  /** Re-read the thread (lines + token) after a write. */
  onRefresh: () => void;
  /** Prefill the composer and jump to Chat. */
  onAsk: (text: string) => void;
  /** This talent's services. When present, chips are their category names. */
  serviceMenu?: readonly {
    title: string;
    category: string;
    amountCents?: number | null;
    currency?: string | null;
    priceLabel?: string | null;
  }[];
};

function Chip({ on, label, onClick, C, accent }: { on: boolean; label: string; onClick: () => void; C: Palette; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        border: on ? `1.5px solid ${accent}` : `1px solid ${C.borderSoft}`,
        background: on ? `${accent}14` : "#fff",
        color: on ? accent : C.ink,
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: FONT,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SmallButton({ label, onClick, primary, disabled, C, accent, accentInk, href }: { label: string; onClick?: () => void; primary?: boolean; disabled?: boolean; C: Palette; accent: string; accentInk: string; href?: string }) {
  const style: React.CSSProperties = {
    border: primary ? "none" : `1px solid ${C.borderSoft}`,
    background: primary ? accent : "#fff",
    color: primary ? accentInk : C.ink,
    borderRadius: 10,
    padding: "7px 11px",
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: FONT,
    whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textDecoration: "none",
    display: "inline-block",
  };
  if (href) return <a href={href} style={style}>{label}</a>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {label}
    </button>
  );
}

export function GuestDockCatalog(p: GuestDockCatalogProps) {
  const { tenantSlug, businessName, t, C, accent, accentInk, inquiryId, threadToken, sourcePage, onEnsureInquiry, onRefresh, onAsk, serviceMenu = [] } = p;
  const serviceChips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of serviceMenu) {
      if (!item.category || seen.has(item.category)) continue;
      seen.add(item.category);
      out.push(item.category);
    }
    return out;
  }, [serviceMenu]);
  const [serviceChip, setServiceChip] = useState<string | null>(null);
  const pathname = usePathname();
  const cart = useInquiryCart();
  const [groups, setGroups] = useState<GuestCatalogGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<GuestCatalogRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGuestItemsCatalog({ tenantSlug, inquiryId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setGroups(res.groups);
      setCategory((c) => c ?? res.groups[0]?.category ?? null);
    });
    return () => {
      cancelled = true;
    };
    // The catalog is per tenant; the inquiry only adds a date for availability.
  }, [tenantSlug, inquiryId]);

  const add = useCallback(
    async (row: GuestCatalogRow, token: string) => {
      if (!row.offeringId) return;
      setBusyId(row.id);
      const res = await messagingClientAddItem({ token, offeringId: row.offeringId, label: row.title, units: 1, sessionId: row.sessionId });
      setBusyId(null);
      if (!res.ok) {
        setNotice(t("public.guestChat.catalogAddFailed"));
        return;
      }
      setAddedIds((s) => new Set(s).add(row.id));
      setNotice(interpolate(t("public.guestChat.catalogAdded"), { item: row.title }));
      onRefresh();
    },
    [onRefresh, t],
  );

  // An add requested before the inquiry (and its token) existed runs once the token lands.
  useEffect(() => {
    if (pending && threadToken) {
      const row = pending;
      setPending(null);
      void add(row, threadToken);
    }
  }, [pending, threadToken, add]);

  const onAdd = useCallback(
    async (row: GuestCatalogRow) => {
      if (threadToken) return add(row, threadToken);
      if (!onEnsureInquiry) {
        setNotice(t("public.guestChat.catalogAddFailed"));
        return;
      }
      setBusyId(row.id);
      const id = await onEnsureInquiry();
      setBusyId(null);
      if (!id) {
        setNotice(t("public.guestChat.catalogAddFailed"));
        return;
      }
      setPending(row);
    },
    [add, onEnsureInquiry, t, threadToken],
  );

  const visible = useMemo(() => groups?.find((g) => g.category === category)?.rows ?? [], [groups, category]);

  const usingServices = serviceChips.length > 0;
  const activeService = serviceChip ?? serviceChips[0] ?? null;
  if (failed) return null;
  if (!usingServices && !groups) {
    return <div style={{ padding: "8px 14px", fontSize: 12, color: C.inkDim, fontFamily: FONT }}>{t("public.guestChat.dockLoading")}</div>;
  }
  if (!usingServices && groups && groups.length === 0) return null;

  return (
    <div data-guest-dock-catalog style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 6 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 14px 2px", scrollbarWidth: "none" }}>
        {usingServices
          ? serviceChips.map((label) => (
              <Chip key={label} on={label === activeService} label={label} onClick={() => setServiceChip(label)} C={C} accent={accent} />
            ))
          : (groups ?? []).map((g) => (
              <Chip key={g.category} on={g.category === category} label={t(CATEGORY_KEY[g.category])} onClick={() => setCategory(g.category)} C={C} accent={accent} />
            ))}
      </div>
      {notice && (
        <div role="status" style={{ margin: "0 14px", padding: "7px 10px", borderRadius: 10, background: `${accent}14`, color: accent, fontSize: 12.5, fontWeight: 600, fontFamily: FONT }}>
          {notice}
        </div>
      )}
      {usingServices
        ? serviceMenu.filter((item) => item.category === activeService).map((item) => (
            <div key={item.title} data-guest-catalog-row="service" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                {item.priceLabel ? (
                  <div
                    data-guest-service-price
                    style={{ fontSize: 11.5, color: C.inkDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.priceLabel}
                  </div>
                ) : null}
              </div>
              <SmallButton label={t("public.guestChat.catalogAsk")} onClick={() => onAsk(interpolate(t("public.guestChat.catalogAskPrefill"), { item: item.title, business: businessName }))} C={C} accent={accent} accentInk={accentInk} />
            </div>
          ))
        : null}
      {!usingServices && visible.map((row) => {
        const isTalent = row.category === "talent" && row.talentProfileId;
        const inLineup = isTalent ? cart.isInCart(row.talentProfileId as string) : false;
        const added = addedIds.has(row.id);
        // A ticket buys on its own event page when the event has one (D-MSG-224); the list is the fallback.
        const buyPath = row.category === "ticket" && row.eventSlug ? `/events/${row.eventSlug}` : BUY_HREF[row.category];
        const buyHref = buyPath ? clientLocaleHref(pathname ?? "/", buyPath) : null;
        const price = row.amountCents != null && row.amountCents > 0 ? formatOrderMoney(row.amountCents, "USD") : null;
        return (
          <div key={row.id} data-guest-catalog-row={row.category} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
              <div style={{ fontSize: 11.5, color: C.inkDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[price, row.sub, !row.available ? t("public.guestChat.catalogUnavailable") : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            {isTalent ? (
              <SmallButton
                label={inLineup ? t("public.guestChat.catalogInLineup") : t("public.guestChat.catalogAddLineup")}
                primary={!inLineup}
                onClick={() => cart.setInCart({ talentProfileId: row.talentProfileId as string, profileCode: row.profileCode ?? "", displayName: row.title }, !inLineup, sourcePage)}
                C={C}
                accent={accent}
                accentInk={accentInk}
              />
            ) : row.offeringId && row.available ? (
              <SmallButton
                label={added ? t("public.guestChat.catalogInInquiry") : busyId === row.id ? t("public.guestChat.catalogAdding") : t("public.guestChat.catalogAddInquiry")}
                primary={!added}
                disabled={added || busyId === row.id}
                onClick={() => void onAdd(row)}
                C={C}
                accent={accent}
                accentInk={accentInk}
              />
            ) : null}
            {buyHref && row.available ? <SmallButton label={t("public.guestChat.catalogBuyNow")} href={buyHref} C={C} accent={accent} accentInk={accentInk} /> : null}
            <SmallButton label={t("public.guestChat.catalogAsk")} onClick={() => onAsk(interpolate(t("public.guestChat.catalogAskPrefill"), { item: row.title, business: businessName }))} C={C} accent={accent} accentInk={accentInk} />
          </div>
        );
      })}
    </div>
  );
}
