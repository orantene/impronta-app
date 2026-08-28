"use client";

/**
 * DiscountsView — ONE list for every discount the platform can give.
 *
 * WHAT THIS ENDS: there were two discount screens that could not see each
 * other. Billing → Discount codes wrote to Stripe with no database row, so its
 * codes were invisible to `?promo=` (the funnel answered "Code not found" for a
 * code that was live). Pricing → Discounts wrote to the database and mirrored
 * to Stripe. A third concept, the per-account grant, existed as a plan override
 * with no billing effect at all. Three tools, one job, none of them complete.
 *
 * Now: code discounts and account grants sit on one page, in one store each,
 * with `importStripePromotionCodes` as the bridge that brought the Stripe-only
 * codes across before the old screen was deleted.
 *
 * Drawer state lives in the URL (`?d=new`, `?d=account:new`) via `useUrlDrawer`,
 * so a deep link restores the open drawer and Back closes it. On a COLD load the
 * server's reading of `?d=` seeds it -- see the drawer-state comment below.
 */

import * as React from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useUrlDrawer } from "@/components/admin/drawer/use-url-drawer";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import type { AccountDiscountRow } from "@/lib/billing/subscription-discounts";
import { HQ, F } from "../_tokens";
import { SectionLabel, EmptyHint } from "../_primitives";
import { DiscountCreateDrawer } from "./DiscountCreateDrawer";
import { DiscountEditDrawer } from "./DiscountEditDrawer";
import { DiscountUsageDrawer } from "./DiscountUsageDrawer";
import { AccountDiscountDrawer } from "./AccountDiscountDrawer";
import {
  AccountGrantRow,
  DiscountCodeRow,
  ACCOUNT_GRID,
  CODE_GRID,
} from "./DiscountRow";
import { ImportFromStripeButton } from "./ImportFromStripeButton";
import type { DiscountTierOption } from "./discount-format";

const P = "dashboard.platform.commerce.discounts";

export type AccountGrant = AccountDiscountRow & { subjectLabel: string | null };

export function DiscountsView({
  discounts,
  accountDiscounts,
  tiers,
  initialDrawerId = null,
}: {
  discounts: PricingDiscountRow[];
  accountDiscounts: AccountGrant[];
  tiers: DiscountTierOption[];
  /** `?d=` as the SERVER saw it. See the drawer-state comment below. */
  initialDrawerId?: string | null;
}) {
  const t = useT();
  const [urlDrawer, setOpenDrawer] = useUrlDrawer<string>();

  // `useUrlDrawer` reads `?d=` through useSearchParams, which is only populated
  // once the client has hydrated. Invisible when you CLICK a button, but on a
  // cold load of a shared link the drawer stayed shut while the id sat right
  // there in the address bar. So the server's reading seeds the first render and
  // the hook takes over from the first interaction. `closed` is what makes
  // closing stick: without it the seed would reopen the drawer the user just
  // dismissed, since the prop cannot change without a fresh navigation.
  const [closed, setClosed] = React.useState(false);
  const openDrawer = urlDrawer ?? (closed ? null : initialDrawerId);

  const editId = openDrawer?.startsWith("edit:") ? openDrawer.slice(5) : null;
  const usageId = openDrawer?.startsWith("uses:") ? openDrawer.slice(5) : null;
  const editingDiscount = editId
    ? (discounts.find((d) => d.id === editId) ?? null)
    : null;
  const usageDiscount = usageId
    ? (discounts.find((d) => d.id === usageId) ?? null)
    : null;

  const activeCodes = discounts.filter((d) => d.isActive);
  const archivedCodes = discounts.filter((d) => !d.isActive);
  const activeGrants = accountDiscounts.filter((d) => d.status === "active");
  const endedGrants = accountDiscounts.filter((d) => d.status !== "active");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PrimaryButton
          label={t(`${P}.newCode`)}
          onClick={() => {
            setClosed(false);
            setOpenDrawer("new");
          }}
        />
        <SecondaryButton
          label={t(`${P}.newAccountGrant`)}
          onClick={() => {
            setClosed(false);
            setOpenDrawer("account:new");
          }}
        />
        <ImportFromStripeButton />
      </div>

      {/* ── Code discounts ───────────────────────────────────────────── */}
      <SectionLabel
        title={t(`${P}.activeCodesTitle`)}
        hint={interpolate(t(`${P}.activeCodesHint`), {
          active: activeCodes.length,
          total: discounts.length,
        })}
      />
      {activeCodes.length === 0 ? (
        <EmptyHint text={t(`${P}.emptyActive`)} />
      ) : (
        <Table
          grid={CODE_GRID}
          headers={[
            t(`${P}.colCode`),
            t(`${P}.colKind`),
            t(`${P}.colValue`),
            t(`${P}.colUses`),
            t(`${P}.colScope`),
            t(`${P}.colWindow`),
            t(`${P}.colStripe`),
            "",
          ]}
        >
          {activeCodes.map((row) => (
            <DiscountCodeRow
              key={row.id}
              row={row}
              tiers={tiers}
              onEdit={() => {
                setClosed(false);
                setOpenDrawer(`edit:${row.id}`);
              }}
              onViewUses={() => {
                setClosed(false);
                setOpenDrawer(`uses:${row.id}`);
              }}
            />
          ))}
        </Table>
      )}

      {archivedCodes.length > 0 && (
        <Archived
          summary={interpolate(t(`${P}.archivedSummary`), {
            count: archivedCodes.length,
          })}
        >
          <Table grid={CODE_GRID} headers={[]} dimmed>
            {archivedCodes.map((row) => (
              <DiscountCodeRow
                key={row.id}
                row={row}
                tiers={tiers}
                dimmed
                onViewUses={() => {
                  setClosed(false);
                  setOpenDrawer(`uses:${row.id}`);
                }}
              />
            ))}
          </Table>
        </Archived>
      )}

      {/* ── Account grants ───────────────────────────────────────────── */}
      <SectionLabel
        title={t(`${P}.accountSectionTitle`)}
        hint={t(`${P}.accountSectionHint`)}
      />
      {activeGrants.length === 0 ? (
        <EmptyHint text={t(`${P}.emptyAccountGrants`)} />
      ) : (
        <Table
          grid={ACCOUNT_GRID}
          headers={[
            t(`${P}.colAccount`),
            t(`${P}.colKind`),
            t(`${P}.colValue`),
            t(`${P}.colApplied`),
            t(`${P}.colStripe`),
            "",
          ]}
        >
          {activeGrants.map((row) => (
            <AccountGrantRow key={row.id} row={row} />
          ))}
        </Table>
      )}

      {endedGrants.length > 0 && (
        <Archived
          summary={interpolate(t(`${P}.endedGrantsSummary`), {
            count: endedGrants.length,
          })}
        >
          <Table grid={ACCOUNT_GRID} headers={[]} dimmed>
            {endedGrants.map((row) => (
              <AccountGrantRow key={row.id} row={row} />
            ))}
          </Table>
        </Archived>
      )}

      {openDrawer === "new" && (
        <DiscountCreateDrawer
          tiers={tiers}
          onClose={() => {
            setClosed(true);
            setOpenDrawer(null);
          }}
        />
      )}
      {editingDiscount && (
        <DiscountEditDrawer
          row={editingDiscount}
          tiers={tiers}
          onClose={() => {
            setClosed(true);
            setOpenDrawer(null);
          }}
        />
      )}
      {usageDiscount && (
        <DiscountUsageDrawer
          row={usageDiscount}
          onClose={() => {
            setClosed(true);
            setOpenDrawer(null);
          }}
        />
      )}
      {openDrawer === "account:new" && (
        <AccountDiscountDrawer
          onClose={() => {
            setClosed(true);
            setOpenDrawer(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

function Table({
  grid,
  headers,
  dimmed,
  children,
}: {
  grid: string;
  headers: string[];
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="table"
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: F,
        opacity: dimmed ? 0.65 : 1,
      }}
    >
      {headers.length > 0 && (
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: grid,
            gap: 12,
            padding: "10px 14px",
            borderBottom: `1px solid ${HQ.borderSoft}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: HQ.inkMuted,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {headers.map((h, i) => (
            <span key={`${h}-${i}`}>{h}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

function Archived({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        color: HQ.inkMuted,
        fontSize: 12,
        fontFamily: F,
      }}
    >
      <summary style={{ cursor: "pointer" }}>{summary}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

function PrimaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: HQ.ink,
        color: HQ.bg,
        border: "none",
        borderRadius: 8,
        padding: "10px 16px",
        fontSize: 13,
        fontFamily: F,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        color: HQ.ink,
        border: `1px solid ${HQ.borderHover}`,
        borderRadius: 8,
        padding: "10px 16px",
        fontSize: 13,
        fontFamily: F,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
