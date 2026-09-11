"use client";

/**
 * PersonRegisterPin — the Access hat's register PIN (W29 · Roles): the 4 to
 * 6 digits this person types to unlock a till (`POSLock`), to switch
 * operator, and, for a manager, to approve a custom amount over the
 * workspace's limit (`POSManagerApproval`).
 *
 * WIRED to `posSetStaffPin` (`pos_set_staff_pin`): the digits are hashed on
 * the server and only the hash is stored (`agencies.settings.people.pins`);
 * nothing here can read a PIN back, only replace it. Only an owner, admin or
 * manager may set one, and the engine says so (`not_manager`) when someone
 * else tries.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { posSetStaffPin } from "../pos/actions";
import { PEOPLE_INPUT, PEOPLE_MUTED, PEOPLE_NOTE, PEOPLE_REFUSAL, PEOPLE_SECONDARY_ACTION } from "./people-classes";

const K = "admin.people.pin";

/** Every code `posSetStaffPin` can answer, as the engine's own sentence. */
const REFUSAL: Record<string, (t: ReturnType<typeof useT>) => string> = {
  not_manager: (t) => t("dashboard.pos.engine.refusal.not_manager"),
  invalid: (t) => t("dashboard.pos.engine.refusal.invalid"),
  not_found: (t) => t("dashboard.pos.engine.refusal.not_found"),
  unavailable: (t) => t("dashboard.pos.engine.refusal.unavailable"),
  not_allowed: (t) => t("dashboard.pos.engine.refusal.not_allowed"),
};

export function PersonRegisterPin({ accountId, hasPin }: { accountId: string; hasPin: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pin, setPin] = useState("");
  const [outcome, setOutcome] = useState<{ kind: "saved" } | { kind: "refusal"; sentence: string } | null>(null);
  const valid = /^[0-9]{4,6}$/.test(pin);

  return (
    <div className="flex flex-col gap-[8px]" data-people-register-pin={hasPin ? "set" : "none"}>
      <p className="m-0 text-[14px] font-semibold text-admin-ink">{t(`${K}.title`)}</p>
      <p className={PEOPLE_MUTED}>{hasPin ? t(`${K}.set`) : t(`${K}.none`)}</p>
      <form
        className="flex flex-wrap items-center gap-[8px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setOutcome(null);
          startTransition(async () => {
            const r = await posSetStaffPin({ userId: accountId, pin });
            if (!r.ok) {
              setOutcome({ kind: "refusal", sentence: (REFUSAL[r.reason] ?? REFUSAL.unavailable)(t) });
              return;
            }
            setPin("");
            setOutcome({ kind: "saved" });
            router.refresh();
          });
        }}
      >
        <label className="sr-only" htmlFor={`pin-${accountId}`}>
          {t(`${K}.label`)}
        </label>
        <input
          id={`pin-${accountId}`}
          className={`${PEOPLE_INPUT} max-w-[10rem]`}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4,6}"
          maxLength={6}
          placeholder={t(`${K}.placeholder`)}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={pending}
        />
        <button type="submit" className={PEOPLE_SECONDARY_ACTION} disabled={pending || !valid} data-people-pin-save>
          {pending ? t(`${K}.saving`) : hasPin ? t(`${K}.replace`) : t(`${K}.save`)}
        </button>
      </form>
      {outcome?.kind === "saved" ? (
        <p role="status" className={PEOPLE_NOTE}>
          {t(`${K}.saved`)}
        </p>
      ) : outcome?.kind === "refusal" ? (
        <p role="alert" className={PEOPLE_REFUSAL}>
          {outcome.sentence}
        </p>
      ) : null}
    </div>
  );
}
