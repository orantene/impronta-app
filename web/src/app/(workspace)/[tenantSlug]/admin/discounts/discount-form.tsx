"use client";

/**
 * The two client islands on the Promotions page: `New promotion` (the
 * button opens the form; the real `createTenantPromo` writes it, and the
 * page's own table shows it after a refresh) and the per-row on/off switch
 * (`setTenantPromoActive`).
 *
 * KIND IS THE TABLE'S. `tenant_promo_codes.kind` is `percent` or `fixed`
 * with a CHECK; the earlier form sent `amount`, which the CHECK refused, so
 * every fixed code ever typed was lost with "unavailable". A fixed value is
 * typed in major units and sent as cents with the workspace currency.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { createTenantPromo, setTenantPromoActive } from "./actions";

const INPUT =
  "h-[36px] w-full min-w-0 rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[13px] text-admin-ink";
const LABEL = "mb-[6px] block text-[12px] font-semibold text-admin-ink";

export function DiscountForm({ currency }: { currency: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        data-testid="discounts-new"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-admin-brand bg-admin-brand px-3.5 text-[13px] font-semibold text-white hover:bg-admin-brand-deep"
      >
        + {t("dashboard.discounts.newPromotion")}
      </button>
      {open ? (
        <form
          data-testid="discounts-form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            const n = Number(value);
            void createTenantPromo({
              code,
              kind,
              value: kind === "percent" ? Math.round(n) : Math.round(n * 100),
              currency: kind === "fixed" ? currency : undefined,
              label: label.trim() || undefined,
            }).then((r) => {
              setBusy(false);
              setMsg(r.ok ? "saved" : r.error);
              if (r.ok) {
                setCode("");
                setLabel("");
                router.refresh();
              }
            });
          }}
          className="absolute right-0 top-[42px] z-20 grid w-[360px] gap-3 rounded-[14px] border border-admin-border bg-admin-card p-4 shadow-admin-hover"
        >
          <label>
            <span className={LABEL}>{t("dashboard.discounts.form.code")}</span>
            <input name="code" value={code} onChange={(e) => setCode(e.target.value)} required minLength={2} maxLength={40} className={INPUT} />
          </label>
          <label>
            <span className={LABEL}>{t("dashboard.discounts.form.label")}</span>
            <input name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={LABEL}>{t("dashboard.discounts.form.kind")}</span>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value === "fixed" ? "fixed" : "percent")} className={INPUT}>
                <option value="percent">{t("dashboard.discounts.form.percent")}</option>
                <option value="fixed">{t("dashboard.discounts.form.fixed").replace("{currency}", currency)}</option>
              </select>
            </label>
            <label>
              <span className={LABEL}>{t("dashboard.discounts.form.value")}</span>
              <input name="value" type="number" min={kind === "percent" ? 1 : 0.01} max={kind === "percent" ? 100 : undefined} step={kind === "percent" ? 1 : 0.01} value={value} onChange={(e) => setValue(e.target.value)} required className={INPUT} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-admin-brand bg-admin-brand px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("dashboard.discounts.form.saving") : t("dashboard.discounts.form.add")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-[34px] cursor-pointer items-center rounded-[9px] border border-admin-border bg-admin-card px-3.5 text-[13px] font-semibold text-admin-ink">
              {t("dashboard.discounts.form.close")}
            </button>
          </div>
          {msg ? (
            <p role="status" className={`m-0 text-[12.5px] ${msg === "saved" ? "text-admin-green" : "text-admin-red"}`}>
              {msg === "saved" ? "saved" : t(REFUSAL_KEY[msg] ?? "dashboard.discounts.form.refused")}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

const REFUSAL_KEY: Record<string, string> = {
  not_allowed: "dashboard.discounts.form.notAllowed",
  invalid: "dashboard.discounts.form.invalid",
  unavailable: "dashboard.discounts.form.unavailable",
};

export function DiscountActiveSwitch({ id, active }: { id: string; active: boolean }) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? t("dashboard.discounts.on") : t("dashboard.discounts.off")}
      disabled={busy}
      data-testid="discounts-active"
      onClick={() => {
        const next = !on;
        setOn(next);
        setBusy(true);
        void setTenantPromoActive(id, next).then((r) => {
          setBusy(false);
          if (!r.ok) setOn(!next);
          else router.refresh();
        });
      }}
      className={`relative inline-flex h-[20px] w-[34px] shrink-0 cursor-pointer items-center rounded-full ${on ? "bg-admin-brand" : "bg-admin-border-strong"} disabled:cursor-wait`}
    >
      <span aria-hidden className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-admin-card shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  );
}
