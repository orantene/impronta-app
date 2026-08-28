"use client";

/**
 * AccountDiscountDrawer — "give THIS account a better deal", the owner's core
 * ask, as one form.
 *
 * The account is picked by NAME. Until now the only way to express a per-account
 * deal was a plan override with `grant_kind='promo'` — a label that read like a
 * discount and had zero billing effect, so the invoice charged full price. This
 * writes a `subscription_discounts` row, mints a private coupon, and attaches it
 * to the live subscription if the account already pays us.
 *
 * The coupon is never a typeable code, on purpose: an account discount that
 * anyone could redeem is not an account discount.
 */

import { useEffect, useState, useTransition } from "react";
import { BadgePercent } from "lucide-react";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import {
  searchAssignableAccounts,
  setAccountDiscount,
  type AssignableAccount,
} from "@/lib/server-actions/admin-subscription-discounts";
import {
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { useT } from "@/i18n/use-t";
import { HQ, F } from "../_tokens";
import { Field, inputStyle } from "../_primitives";
import { DrawerSaveBar, FieldRow, SubHeading } from "./drawer-parts";

const P = "dashboard.platform.commerce.discounts";

type Duration = "once" | "repeating" | "forever";

export function AccountDiscountDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssignableAccount[]>([]);
  const [selected, setSelected] = useState<AssignableAccount | null>(null);
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState<DefaultCurrencyCode>("USD");
  const [duration, setDuration] = useState<Duration>("forever");
  const [durationMonths, setDurationMonths] = useState("3");
  const [note, setNote] = useState("");

  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "stub" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Debounced so a fast typist does not fire a query per keystroke.
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchAssignableAccounts(q).then((res) => {
        if (!cancelled) setResults(res.accounts);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  const valueNumber = Number(value);
  const validValue = /^[0-9]+(\.[0-9]{1,2})?$/.test(value) && valueNumber > 0;
  const canSave = Boolean(selected) && validValue && state !== "saving";
  const dirty = Boolean(selected) || value.length > 0;

  function save() {
    if (!selected) return;
    setState("saving");
    setMessage(null);
    startTransition(async () => {
      const res = await setAccountDiscount({
        subjectType: selected.type,
        tenantId: selected.type === "workspace" ? selected.id : null,
        talentProfileId: selected.type === "talent" ? selected.id : null,
        kind,
        value: valueNumber,
        currency: kind === "fixed" ? currency : null,
        duration,
        durationMonths:
          duration === "repeating"
            ? Math.max(1, Math.round(Number(durationMonths) || 1))
            : null,
        note: note.trim() || null,
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
      title={t(`${P}.accountDrawerTitle`)}
      subtitle={t(`${P}.accountDrawerSubtitle`)}
      icon={BadgePercent}
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
        <SubHeading text={t(`${P}.accountSection`)} />
        {selected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: HQ.cardSoft,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <span style={{ fontSize: 13 }}>{selected.label}</span>
            <span style={{ fontSize: 11, color: HQ.inkDim }}>
              {selected.type === "workspace"
                ? t(`${P}.subjectWorkspace`)
                : t(`${P}.subjectTalent`)}
              {selected.plan ? ` · ${selected.plan}` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: HQ.inkMuted,
                fontSize: 11,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {t(`${P}.accountChange`)}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Field label={t(`${P}.accountSearchLabel`)}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(`${P}.accountSearchPlaceholder`)}
                style={{ ...inputStyle(), maxWidth: 340 }}
              />
            </Field>
            {results.length > 0 && (
              <div
                style={{
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.borderSoft}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  maxWidth: 340,
                }}
              >
                {results.map((account) => (
                  <button
                    key={`${account.type}:${account.id}`}
                    type="button"
                    onClick={() => setSelected(account)}
                    style={{
                      display: "flex",
                      width: "100%",
                      gap: 8,
                      alignItems: "baseline",
                      background: "transparent",
                      border: "none",
                      borderTop: `1px solid ${HQ.borderSoft}`,
                      padding: "8px 12px",
                      color: HQ.ink,
                      fontFamily: F,
                      fontSize: 12.5,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span>{account.label}</span>
                    <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
                      {account.type === "workspace"
                        ? t(`${P}.subjectWorkspace`)
                        : t(`${P}.subjectTalent`)}
                      {account.plan ? ` · ${account.plan}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <SubHeading text={t(`${P}.sectionAmount`)} />
        <FieldRow>
          <Field label={t(`${P}.kindField`)}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "percent" | "fixed")}
              style={{ ...inputStyle(), width: 170 }}
            >
              <option value="percent">{t(`${P}.kindPercent`)}</option>
              <option value="fixed">{t(`${P}.kindFixed`)}</option>
            </select>
          </Field>
          <Field
            label={
              kind === "percent" ? t(`${P}.valuePercent`) : t(`${P}.valueFixed`)
            }
          >
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "percent" ? "30" : "50"}
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
          <Field label={t(`${P}.noteField`)}>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(`${P}.notePlaceholder`)}
              maxLength={280}
              style={{ ...inputStyle(), width: 260 }}
            />
          </Field>
        </FieldRow>
        <p
          style={{
            fontSize: 11,
            color: HQ.inkDim,
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          {t(`${P}.precedenceHint`)}
        </p>

        <DrawerSaveBar
          state={state}
          dirty={dirty}
          canSave={canSave}
          message={message}
          saveLabel={t(`${P}.grantDiscount`)}
          savingLabel={t(`${P}.granting`)}
          savedLabel={t(`${P}.grantedSynced`)}
          cancelLabel={t(`${P}.cancel`)}
          onSave={save}
          onCancel={onClose}
        />
      </div>
    </DrawerShell>
  );
}
