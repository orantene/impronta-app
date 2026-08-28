"use client";

/**
 * DiscountCreateDrawer — mint one code discount, with the full option set.
 *
 * WHAT THIS REPLACES: an inline "+ New code" form that offered code, name,
 * kind, value, max redemptions and a date window. Everything else the schema
 * already stored — duration, per-tier scope, per-customer limit — had no field,
 * so the columns sat at their defaults forever and the operator could not
 * express "30% off for three months, Studio only, one per customer" at all.
 *
 * PER-PRODUCT CHECKBOXES are the headline. Default is every plan, which is what
 * every existing code silently was. A tier with no Stripe product is shown but
 * DISABLED with a reason: Stripe scopes coupons by product id, so a tier
 * without one cannot be restricted, and letting it be checked would produce a
 * coupon valid on the whole catalog. The action refuses the same case server
 * side — this is the explanation, not the enforcement.
 */

import { useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { createDiscount } from "@/lib/server-actions/admin-product-discounts";
import {
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";
import { Field, inputStyle } from "../_primitives";
import type { DiscountTierOption } from "./discount-format";
import { DrawerSaveBar, FieldRow, SubHeading } from "./drawer-parts";

const P = "dashboard.platform.commerce.discounts";

type Kind = "percent" | "fixed" | "free_months";
type Duration = "once" | "repeating" | "forever";
type SaveState = "idle" | "saving" | "saved" | "stub" | "error";

export function DiscountCreateDrawer({
  tiers,
  onClose,
}: {
  tiers: DiscountTierOption[];
  onClose: () => void;
}) {
  const t = useT();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [kind, setKind] = useState<Kind>("percent");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState<DefaultCurrencyCode>("USD");
  const [duration, setDuration] = useState<Duration>("once");
  const [durationMonths, setDurationMonths] = useState("3");
  const [allPlans, setAllPlans] = useState(true);
  const [checkedTiers, setCheckedTiers] = useState<string[]>([]);
  const [firstTimeOnly, setFirstTimeOnly] = useState(false);
  const [minimumAmount, setMinimumAmount] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const valueNumber = Number(value);
  const validValue = /^[0-9]+(\.[0-9]{1,2})?$/.test(value) && valueNumber > 0;
  const validCode = /^[a-zA-Z0-9_-]{3,32}$/.test(code);
  const validScope = allPlans || checkedTiers.length > 0;
  const dirty = code.length > 0 || name.length > 0 || value.length > 0;
  const canSave =
    validCode &&
    name.trim().length > 0 &&
    validValue &&
    validScope &&
    state !== "saving";

  function toggleTier(id: string) {
    setCheckedTiers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function save() {
    setState("saving");
    setMessage(null);
    startTransition(async () => {
      const isoOrNull = (raw: string) => {
        if (!raw) return null;
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      };
      const minCents = minimumAmount
        ? Math.round(Number(minimumAmount) * 100)
        : null;
      const res = await createDiscount({
        code,
        name,
        kind,
        value: valueNumber,
        currency: kind === "fixed" ? currency : undefined,
        duration: kind === "free_months" ? "repeating" : duration,
        durationMonths:
          kind === "free_months"
            ? Math.round(valueNumber)
            : duration === "repeating"
              ? Math.max(1, Math.round(Number(durationMonths) || 1))
              : null,
        appliesTo: allPlans ? "all" : checkedTiers,
        maxRedemptions: maxRedemptions
          ? Math.max(1, Math.floor(Number(maxRedemptions)))
          : undefined,
        perCustomerLimit: Math.max(1, Math.floor(Number(perCustomerLimit) || 1)),
        startsAt: isoOrNull(startsAt),
        endsAt: isoOrNull(endsAt),
        firstTimeOnly,
        minimumAmountCents: minCents && minCents > 0 ? minCents : null,
        minimumAmountCurrency: minCents && minCents > 0 ? currency : null,
        campaign: campaign.trim() || null,
      });
      if (!res.ok) {
        setState("error");
        setMessage(res.error);
        return;
      }
      if (res.stripe.stub) {
        setState("stub");
        setMessage(res.stripe.reason ?? t(`${P}.savedDbOnlyDefault`));
        return;
      }
      setState("saved");
      setTimeout(onClose, 900);
    });
  }

  return (
    <DrawerShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(`${P}.newCodeTitle`)}
      subtitle={t(`${P}.newCodeSubtitle`)}
      icon={Ticket}
      size="md"
    >
      <div
        style={{
          fontFamily: F,
          color: HQ.ink,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <FieldRow>
          <Field label={t(`${P}.codeField`)}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LAUNCH50"
              maxLength={32}
              style={{ ...inputStyle(), width: 200 }}
            />
          </Field>
          <Field label={t(`${P}.internalName`)}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(`${P}.internalNamePlaceholder`)}
              maxLength={80}
              style={{ ...inputStyle(), width: 240 }}
            />
          </Field>
          <Field label={t(`${P}.campaignField`)}>
            <input
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder={t(`${P}.campaignPlaceholder`)}
              maxLength={60}
              style={{ ...inputStyle(), width: 200 }}
            />
          </Field>
        </FieldRow>

        <SubHeading text={t(`${P}.sectionAmount`)} />
        <FieldRow>
          <Field label={t(`${P}.kindField`)}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              style={{ ...inputStyle(), width: 170 }}
            >
              <option value="percent">{t(`${P}.kindPercent`)}</option>
              <option value="fixed">{t(`${P}.kindFixed`)}</option>
              <option value="free_months">{t(`${P}.kindMonths`)}</option>
            </select>
          </Field>
          <Field
            label={
              kind === "percent"
                ? t(`${P}.valuePercent`)
                : kind === "fixed"
                  ? t(`${P}.valueFixed`)
                  : t(`${P}.valueMonths`)
            }
          >
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "percent" ? "50" : kind === "fixed" ? "10" : "2"}
              style={{ ...inputStyle(), width: 110 }}
            />
          </Field>
          {kind === "fixed" && (
            <Field label={t(`${P}.currencyField`)}>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as DefaultCurrencyCode)}
                style={{ ...inputStyle(), width: 100 }}
              >
                {DEFAULT_CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </FieldRow>

        {kind === "free_months" ? (
          <p style={hintStyle}>{t(`${P}.freeMonthsHint`)}</p>
        ) : (
          <FieldRow>
            <Field label={t(`${P}.durationField`)}>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as Duration)}
                style={{ ...inputStyle(), width: 200 }}
              >
                <option value="once">{t(`${P}.durationOnce`)}</option>
                <option value="repeating">{t(`${P}.durationRepeating`)}</option>
                <option value="forever">{t(`${P}.durationForever`)}</option>
              </select>
            </Field>
            {duration === "repeating" && (
              <Field label={t(`${P}.durationMonthsField`)}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationMonths}
                  onChange={(e) =>
                    setDurationMonths(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  style={{ ...inputStyle(), width: 90 }}
                />
              </Field>
            )}
          </FieldRow>
        )}

        <SubHeading text={t(`${P}.sectionScope`)} />
        <PlanScopePicker
          tiers={tiers}
          allPlans={allPlans}
          setAllPlans={setAllPlans}
          checkedTiers={checkedTiers}
          toggleTier={toggleTier}
        />

        <SubHeading text={t(`${P}.sectionLimits`)} />
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={firstTimeOnly}
            onChange={(e) => setFirstTimeOnly(e.target.checked)}
          />
          <span>
            <span style={{ fontSize: 12.5 }}>{t(`${P}.firstTimeOnly`)}</span>
            <span style={hintStyle}>{t(`${P}.firstTimeOnlyHint`)}</span>
          </span>
        </label>
        <FieldRow>
          <Field label={t(`${P}.minimumSpend`)}>
            <input
              type="text"
              inputMode="decimal"
              value={minimumAmount}
              onChange={(e) =>
                setMinimumAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder={t(`${P}.minimumSpendPlaceholder`)}
              style={{ ...inputStyle(), width: 140 }}
            />
          </Field>
          <Field label={t(`${P}.maxRedemptions`)}>
            <input
              type="text"
              inputMode="numeric"
              value={maxRedemptions}
              onChange={(e) =>
                setMaxRedemptions(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder={t(`${P}.maxRedemptionsPlaceholder`)}
              style={{ ...inputStyle(), width: 140 }}
            />
          </Field>
          <Field label={t(`${P}.perCustomerLimit`)}>
            <input
              type="text"
              inputMode="numeric"
              value={perCustomerLimit}
              onChange={(e) =>
                setPerCustomerLimit(e.target.value.replace(/[^0-9]/g, ""))
              }
              style={{ ...inputStyle(), width: 110 }}
            />
          </Field>
        </FieldRow>

        <SubHeading text={t(`${P}.sectionSchedule`)} />
        <FieldRow>
          <Field label={t(`${P}.startsAt`)}>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ ...inputStyle(), width: 220 }}
            />
          </Field>
          <Field label={t(`${P}.endsAt`)}>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ ...inputStyle(), width: 220 }}
            />
          </Field>
        </FieldRow>
        <p style={hintStyle}>{t(`${P}.startsAtHint`)}</p>

        <DrawerSaveBar
          state={state}
          dirty={dirty}
          canSave={canSave}
          message={message}
          saveLabel={t(`${P}.createCode`)}
          savingLabel={t(`${P}.creating`)}
          savedLabel={t(`${P}.createdSynced`)}
          cancelLabel={t(`${P}.cancel`)}
          onSave={save}
          onCancel={onClose}
        />
      </div>
    </DrawerShell>
  );
}

// ─── Plan scope ──────────────────────────────────────────────────────────────

function PlanScopePicker({
  tiers,
  allPlans,
  setAllPlans,
  checkedTiers,
  toggleTier,
}: {
  tiers: DiscountTierOption[];
  allPlans: boolean;
  setAllPlans: (next: boolean) => void;
  checkedTiers: string[];
  toggleTier: (id: string) => void;
}) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={allPlans}
          onChange={(e) => setAllPlans(e.target.checked)}
        />
        <span>
          <span style={{ fontSize: 12.5 }}>{t(`${P}.scopeAllPlans`)}</span>
          <span style={hintStyle}>{t(`${P}.scopeAllPlansHint`)}</span>
        </span>
      </label>
      {!allPlans && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 6,
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 8,
            padding: 10,
          }}
        >
          {tiers.length === 0 && (
            <span style={hintStyle}>{t(`${P}.scopeNoTiers`)}</span>
          )}
          {tiers.map((tier) => (
            <label
              key={tier.id}
              title={
                tier.hasStripeProduct
                  ? undefined
                  : t(`${P}.scopeNoStripeProduct`)
              }
              style={{
                ...checkboxRowStyle,
                opacity: tier.hasStripeProduct ? 1 : 0.5,
                cursor: tier.hasStripeProduct ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                disabled={!tier.hasStripeProduct}
                checked={checkedTiers.includes(tier.id)}
                onChange={() => toggleTier(tier.id)}
              />
              <span>
                <span style={{ fontSize: 12.5 }}>{tier.name}</span>
                <span style={hintStyle}>
                  {tier.hasStripeProduct
                    ? tier.packageLabel
                    : interpolate(t(`${P}.scopeNoStripeProductShort`), {
                        pkg: tier.packageLabel,
                      })}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  cursor: "pointer",
};

const hintStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: HQ.inkDim,
  lineHeight: 1.45,
  margin: 0,
};
