"use client";

/**
 * DiscountEditDrawer — change what a live code can still change.
 *
 * WHY THIS IS SO SMALL: Stripe freezes a coupon's `percent_off` / `amount_off`,
 * `duration`, `duration_in_months` and `max_redemptions` the moment it exists,
 * and a promotion code accepts only `active` and `metadata`. So a percentage or
 * a redemption cap genuinely cannot be edited — TULALA2FREE had to be archived
 * and rebuilt just to go from uncapped to 30 spots.
 *
 * The frozen fields are therefore SHOWN, greyed, with the reason, rather than
 * hidden. Hiding them would mean the operator meets the constraint the way we
 * did: after the campaign was already live.
 */

import { useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { updateDiscount } from "@/lib/server-actions/admin-product-discounts";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import { useT } from "@/i18n/use-t";
import { HQ, F } from "../_tokens";
import { Field, inputStyle } from "../_primitives";
import { DrawerSaveBar, FieldRow, SubHeading } from "./drawer-parts";
import {
  formatDiscountValue,
  formatDuration,
  formatScope,
  type DiscountTierOption,
} from "./discount-format";

const P = "dashboard.platform.commerce.discounts";

type SaveState = "idle" | "saving" | "saved" | "stub" | "error";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`; the row carries a full ISO stamp. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

export function DiscountEditDrawer({
  row,
  tiers,
  onClose,
}: {
  row: PricingDiscountRow;
  tiers: DiscountTierOption[];
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(row.name);
  const [campaign, setCampaign] = useState(row.campaign ?? "");
  const [perCustomer, setPerCustomer] = useState(String(row.perCustomerLimit));
  const [startsAt, setStartsAt] = useState(toLocalInput(row.startsAt));
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const perCustomerNum = Number(perCustomer);
  const perCustomerValid =
    Number.isInteger(perCustomerNum) && perCustomerNum >= 1 && perCustomerNum <= 1000;

  const dirty =
    name !== row.name ||
    campaign !== (row.campaign ?? "") ||
    perCustomer !== String(row.perCustomerLimit) ||
    startsAt !== toLocalInput(row.startsAt);

  function save() {
    setState("saving");
    setMessage(null);
    startTransition(async () => {
      const res = await updateDiscount({
        discountId: row.id,
        name: name.trim(),
        campaign: campaign.trim() ? campaign.trim() : null,
        perCustomerLimit: perCustomerNum,
        startsAt: startsAt ? startsAt : null,
      });
      if (res.ok) {
        setState("saved");
        setMessage(t(`${P}.savedChanges`));
        return;
      }
      setState("error");
      setMessage(res.error);
    });
  }

  return (
    <DrawerShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(`${P}.editTitle`)}
      subtitle={t(`${P}.editSubtitle`)}
      icon={Ticket}
      size="md"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: F }}>
        <code
          style={{
            alignSelf: "flex-start",
            fontSize: 12.5,
            letterSpacing: 0.5,
            color: HQ.ink,
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          {row.code}
        </code>

        <FieldRow>
          <Field label={t(`${P}.internalName`)}>
            <input
              style={inputStyle()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(`${P}.internalNamePlaceholder`)}
            />
          </Field>
          <Field label={t(`${P}.campaignField`)}>
            <input
              style={inputStyle()}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder={t(`${P}.campaignPlaceholder`)}
            />
          </Field>
        </FieldRow>

        <SubHeading text={t(`${P}.sectionLimits`)} />
        <FieldRow>
          <Field label={t(`${P}.perCustomerLimit`)}>
            <input
              style={inputStyle()}
              value={perCustomer}
              onChange={(e) => setPerCustomer(e.target.value)}
              inputMode="numeric"
            />
          </Field>
        </FieldRow>

        <SubHeading text={t(`${P}.sectionSchedule`)} />
        <FieldRow>
          <Field label={t(`${P}.startsAt`)}>
            <input
              style={inputStyle()}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
        </FieldRow>
        <p style={{ fontSize: 11, color: HQ.inkDim, margin: 0, lineHeight: 1.5 }}>
          {t(`${P}.startsAtHint`)}
        </p>

        {/* Frozen fields: visible on purpose. See the file docblock. */}
        <SubHeading text={t(`${P}.lockedSection`)} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            opacity: 0.55,
          }}
        >
          <LockedField label={t(`${P}.colValue`)} value={formatDiscountValue(row, t)} />
          <LockedField
            label={t(`${P}.durationField`)}
            value={formatDuration(row.duration, row.durationMonths, t)}
          />
          <LockedField
            label={t(`${P}.maxRedemptions`)}
            value={row.maxRedemptions == null ? "∞" : String(row.maxRedemptions)}
          />
          <LockedField
            label={t(`${P}.sectionScope`)}
            value={formatScope(row.appliesTo, tiers, t)}
          />
        </div>
        <p style={{ fontSize: 11, color: HQ.inkDim, margin: 0, lineHeight: 1.5 }}>
          {t(`${P}.lockedHint`)}
        </p>

        <DrawerSaveBar
          state={state}
          dirty={dirty}
          canSave={dirty && perCustomerValid && name.trim().length > 0}
          message={message}
          saveLabel={t(`${P}.saveChanges`)}
          savingLabel={t(`${P}.savingChanges`)}
          savedLabel={t(`${P}.savedChanges`)}
          cancelLabel={t(`${P}.cancel`)}
          onSave={save}
          onCancel={onClose}
        />
      </div>
    </DrawerShell>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10.5, color: HQ.inkMuted }}>{label}</span>
      <span style={{ fontSize: 12.5, color: HQ.ink }}>{value}</span>
    </div>
  );
}
