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
 *   bookable kinds   → Select          (service / class storefront page;
 *                                       tickets keep the i18n buy label)
 *   anything         → Ask             (prefills the composer, no write)
 *   talent service   → mode label      (dockServiceCtaLabel: Select / Request /
 *                                       Request a quote / Ask, EN + ES).
 *                                       Select / Request / Buy open the page
 *                                       CatalogBookingSheet (same event as the
 *                                       card skin); quote and Ask stay in chat.
 *
 * A visitor with no inquiry yet gets one on the first add (the panel's
 * ensure path); the thread token is read from that new thread and the add runs
 * at once. A first add that fails discards the empty draft it created.
 */

import { maxDurationRows, onlyAvailableRows, searchCatalogRows, sortCatalogRows, type CatalogSort } from "@/lib/messages-v5/catalog-search";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ItemCategory } from "@/lib/messages-v5/items-picker";
import { messagingClientAddItem } from "@/lib/server-actions/messaging-client";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import type { OfferingCtaKind } from "@/lib/talent/offerings-types";

import { requestChatAddService } from "@/components/public-booking/chat-catalog-events";

import { dockServiceCtaLabel, dockServiceOpensBookingSheet, dockStorefrontCtaLabel } from "./dock-cta-label";

import { getGuestItemsCatalog, type GuestCatalogGroup, type GuestCatalogRow } from "../_actions/guest-catalog-actions";
import { FONT, type paletteFor } from "./mini-chat-styles";
import { addAddedCatalogItem } from "./guest-added-items-store";
import { discardEmptyDraft, readGuestThreadToken, type EnsureInquiryForItems } from "./guest-catalog-add-flow";

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
  /** The talent this dock belongs to (server-provided). Falls back to the /t/<code> path. */
  profileCode?: string | null;
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
  onEnsureInquiry: EnsureInquiryForItems | null;
  /** Re-read the thread (lines + token) after a write. */
  onRefresh: () => void;
  /** Prefill the composer and jump to Chat. */
  onAsk: (text: string) => void;
  /** This talent's services. When present, chips are their category names. */
  serviceMenu?: readonly {
    offeringId?: string | null;
    title: string;
    category: string;
    amountCents?: number | null;
    currency?: string | null;
    priceLabel?: string | null;
    /** Derived CTA (deriveOfferingCta). Absent reads as an inquiry: "Ask". */
    cta?: OfferingCtaKind | null;
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

function SmallButton({ label, onClick, primary, disabled, C, accent, accentInk, href, onSelect }: { label: string; onClick?: () => void; primary?: boolean; disabled?: boolean; C: Palette; accent: string; accentInk: string; href?: string; onSelect?: () => boolean }) {
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
  // TUL-1068: `onSelect` returns true when the page opened the in-page sheet; the link is only the fallback.
  if (href) return <a href={href} style={style} onClick={onSelect ? (e) => { if (onSelect()) e.preventDefault(); } : undefined}>{label}</a>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {label}
    </button>
  );
}

export function GuestDockCatalog(p: GuestDockCatalogProps) {
  const { tenantSlug, businessName, locale, t, C, accent, accentInk, inquiryId, threadToken, sourcePage, onEnsureInquiry, onRefresh, onAsk, serviceMenu = [] } = p;
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
  // P0: per-talent dock => that talent only. The server-provided code wins; the path is only a fallback.
  const pageProfileCode = p.profileCode ?? /^\/(?:[a-z]{2}\/)?t\/([^/?#]+)/.exec(pathname ?? "")?.[1] ?? null;
  const cart = useInquiryCart();
  const [groups, setGroups] = useState<GuestCatalogGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGuestItemsCatalog({ tenantSlug, inquiryId, profileCode: pageProfileCode }).then((res) => {
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
  }, [tenantSlug, inquiryId, pageProfileCode]);

  /** Runs the add with a thread token. Resolves true when the line landed. */
  const add = useCallback(
    async (row: GuestCatalogRow, token: string): Promise<boolean> => {
      if (!row.offeringId) return false;
      const res = await messagingClientAddItem({ token, offeringId: row.offeringId, label: row.title, units: 1, sessionId: row.sessionId });
      if (!res.ok) {
        setNotice(t(res.reason === "invalid" ? "public.guestChat.catalogAddInvalid" : "public.guestChat.catalogAddFailed"));
        return false;
      }
      setAddedIds((s) => new Set(s).add(row.id));
      addAddedCatalogItem({
        id: row.id,
        title: row.title,
        priceLabel: row.amountCents != null && row.amountCents > 0 ? formatOrderMoney(row.amountCents, "USD") : null,
        lineId: res.lineId,
        token,
      });
      setNotice(interpolate(t("public.guestChat.catalogAdded"), { item: row.title }));
      onRefresh();
      return true;
    },
    [onRefresh, t],
  );

  // TUL-1066: the first add of a visitor with no inquiry. The token is read straight
  // from the new thread instead of waiting for the panel's own reload to hand it down
  // (that wait never finished for a signed-out guest, so the add silently never ran).
  // If the add then fails, the empty draft we just created is discarded.
  const onAdd = useCallback(
    async (row: GuestCatalogRow) => {
      if (busyId) return;
      setBusyId(row.id);
      try {
        if (threadToken) {
          await add(row, threadToken);
          return;
        }
        if (!onEnsureInquiry) {
          setNotice(t("public.guestChat.catalogAddFailed"));
          return;
        }
        const createdHere = !inquiryId;
        const id = await onEnsureInquiry();
        const token = id ? await readGuestThreadToken(id) : null;
        if (!id || !token) {
          setNotice(t("public.guestChat.catalogAddFailed"));
          return;
        }
        const added = await add(row, token);
        if (!added && createdHere) await discardEmptyDraft(token, id, onEnsureInquiry);
      } finally {
        setBusyId(null);
      }
    },
    [add, busyId, inquiryId, onEnsureInquiry, t, threadToken],
  );

  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<CatalogSort>("default");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const visible = useMemo(
    () => sortCatalogRows(maxDurationRows(onlyAvailableRows(searchCatalogRows(groups?.find((g) => g.category === category)?.rows ?? [], searchText), availableOnly), maxMinutes), sort),
    [groups, category, searchText, availableOnly, sort, maxMinutes],
  );

  const usingServices = serviceChips.length > 0;
  const activeService = serviceChip ?? serviceChips[0] ?? null;
  const visibleServices = useMemo(
    () =>
      sortCatalogRows(
        searchCatalogRows(
          serviceMenu
            .filter((item) => item.category === activeService)
            .map((item) => ({ ...item, sub: null, amountCents: item.amountCents ?? null, available: true })),
          searchText,
        ),
        sort,
      ),
    [serviceMenu, activeService, searchText, sort],
  );
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
              <Chip key={label} on={label === activeService} label={label} onClick={() => { setServiceChip(label); setNotice(null); }} C={C} accent={accent} />
            ))
          : (groups ?? []).map((g) => (
              <Chip key={g.category} on={g.category === category} label={t(CATEGORY_KEY[g.category])} onClick={() => { setCategory(g.category); setNotice(null); }} C={C} accent={accent} />
            ))}
      </div>
      {/* TUL-1064: search + sort also apply to a talent's categorized service menu. */}
      {(
        <div style={{ padding: "0 14px" }}>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("public.guestChat.catalogSearchPlaceholder")}
            aria-label={t("public.guestChat.catalogSearchPlaceholder")}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.borderSoft}`, borderRadius: 999, padding: "7px 12px", fontSize: 13, fontFamily: FONT, color: C.ink, background: "#fff" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSort)}
              aria-label={t("public.guestChat.catalogSortLabel")}
              style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontFamily: FONT, color: C.ink, background: "#fff" }}
            >
              <option value="default">{t("public.guestChat.catalogSortDefault")}</option>
              <option value="price_asc">{t("public.guestChat.catalogSortPriceAsc")}</option>
              <option value="price_desc">{t("public.guestChat.catalogSortPriceDesc")}</option>
            </select>
            {!usingServices ? (<>
            <select
              value={maxMinutes ?? ""}
              onChange={(e) => setMaxMinutes(e.target.value ? Number(e.target.value) : null)}
              aria-label={t("public.guestChat.catalogDurationLabel")}
              style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontFamily: FONT, color: C.ink, background: "#fff" }}
            >
              <option value="">{t("public.guestChat.catalogDurationAny")}</option>
              <option value="30">{t("public.guestChat.catalogDurationUpTo").replace("{n}", "30")}</option>
              <option value="60">{t("public.guestChat.catalogDurationUpTo").replace("{n}", "60")}</option>
              <option value="90">{t("public.guestChat.catalogDurationUpTo").replace("{n}", "90")}</option>
            </select>
            <Chip on={availableOnly} label={t("public.guestChat.catalogAvailableOnly")} onClick={() => setAvailableOnly((v) => !v)} C={C} accent={accent} />
            </>) : null}
          </div>
        </div>
      )}
      {notice && (
        <div role="status" style={{ margin: "0 14px", padding: "7px 10px", borderRadius: 10, background: `${accent}14`, color: accent, fontSize: 12.5, fontWeight: 600, fontFamily: FONT }}>
          {notice}
        </div>
      )}
      {usingServices
        ? visibleServices.map((item) => {
            const openSheet = dockServiceOpensBookingSheet(item.cta, item.offeringId);
            return (
            <div key={item.title} data-guest-catalog-row="service" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}>
              <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
                {item.priceLabel ? (
                  <div
                    data-guest-service-price
                    style={{ fontSize: 11.5, color: C.inkDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.priceLabel}
                  </div>
                ) : null}
              </div>
              <SmallButton
                label={dockServiceCtaLabel(item.cta, locale)}
                primary={item.cta === "book_now" || item.cta === "request_to_book" || item.cta === "buy_now"}
                onClick={() => {
                  if (openSheet && item.offeringId) {
                    requestChatAddService(item.offeringId);
                    return;
                  }
                  onAsk(interpolate(t("public.guestChat.catalogAskPrefill"), { item: item.title, business: businessName }));
                }}
                C={C}
                accent={accent}
                accentInk={accentInk}
              />
            </div>
            );
          })
        : null}
      {!usingServices && visible.map((row) => {
        const isTalent = row.category === "talent" && row.talentProfileId;
        const inLineup = isTalent ? cart.isInCart(row.talentProfileId as string) : false;
        const added = addedIds.has(row.id);
        // A ticket buys on its own event page when the event has one (D-MSG-224); the list is the fallback.
        const buyPath = row.category === "ticket" && row.eventSlug ? `/events/${row.eventSlug}` : BUY_HREF[row.category];
        // TUL-1068: hub talent pages (/t/<code>) have no /book or /events, so Select would 404 and drop the widget.
        const onHubProfile = /^\/(?:[a-z]{2}\/)?t\//.test(pathname ?? "");
        const buyHref = buyPath && !onHubProfile ? clientLocaleHref(pathname ?? "/", buyPath) : null;
        const price = row.amountCents != null && row.amountCents > 0 ? formatOrderMoney(row.amountCents, "USD") : null;
        return (
          <div key={row.id} data-guest-catalog-row={row.category} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}>
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.title}</div>
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
            {buyHref && row.available ? (
              <SmallButton
                label={dockStorefrontCtaLabel(row.category, locale, t("public.guestChat.catalogBuyNow"))}
                href={buyHref}
                onSelect={row.offeringId && (row.category === "service" || row.category === "class") ? () => requestChatAddService(row.offeringId as string) : undefined}
                C={C}
                accent={accent}
                accentInk={accentInk}
              />
            ) : null}
            <SmallButton label={t("public.guestChat.catalogAsk")} onClick={() => onAsk(interpolate(t("public.guestChat.catalogAskPrefill"), { item: row.title, business: businessName }))} C={C} accent={accent} accentInk={accentInk} />
          </div>
        );
      })}
    </div>
  );
}
