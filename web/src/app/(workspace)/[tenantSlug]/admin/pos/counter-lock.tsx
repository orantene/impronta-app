"use client";

/**
 * useCounterLock — the till's lock and operator switch (`POSLock`, and the
 * till half of `POSChangeServer`), wired to `pos-engine.ts`.
 *
 * THE DEVICE IS THE KEY. A random id the browser keeps in `localStorage`
 * (`pos.deviceKey`) names this tablet; the engine's `pos_device_sessions`
 * row for it says whether the till is locked and who unlocked it. On mount
 * the session is read once (`posCurrentDeviceSession`), so a locked tablet
 * stays locked across a reload. `posLockTill` locks; `posUnlockTill` and
 * `posSwitchOperator` take the person picked on the card and their PIN.
 *
 * The one effect this needs lives here, not in `pos-client.tsx` (which is
 * kept effect-free by `pos-page-wire.static.test.ts`): reading localStorage
 * during render would paint one thing on the server and another after
 * hydration, which is exactly the flicker that rule exists to prevent.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { LockScreen, type LockScreenCopy } from "@/components/admin/pos/LockScreen";
import type { PosPerson } from "@/components/admin/pos/pos-types";
import { posCurrentDeviceSession, posLockTill, posSwitchOperator, posUnlockTill } from "@/lib/server-actions/pos-engine";

const DEVICE_KEY_STORAGE = "pos.deviceKey";

/** The browser's own id for this device; minted once and kept. */
export function readOrMintDeviceKey(): string | null {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE);
    if (existing && existing.length >= 8) return existing;
    const minted = `dev-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_KEY_STORAGE, minted);
    return minted;
  } catch {
    return null;
  }
}

export type CounterLockCopy = LockScreenCopy & {
  /** Every engine refusal as a sentence, by code. */
  readonly refusal: Readonly<Record<string, string>>;
};

export function useCounterLock(input: {
  readonly people: readonly PosPerson[];
  readonly signedInName: string;
  readonly drawerOwnerName: string | null;
  readonly peopleHref: string;
  readonly copy: CounterLockCopy;
}): {
  readonly locked: boolean;
  readonly operatorUserId: string | null;
  readonly operatorName: string;
  readonly overlay: ReactNode;
  readonly lock: () => void;
  readonly openSwitch: () => void;
} {
  const { copy } = input;
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"open" | "locked" | "switch">("open");
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withPins = input.people.filter((p) => p.hasPin);

  useEffect(() => {
    const key = readOrMintDeviceKey();
    setDeviceKey(key);
    if (!key) return;
    let cancelled = false;
    void posCurrentDeviceSession({ deviceKey: key }).then((r) => {
      if (cancelled || !r.ok) return;
      setOperatorUserId(r.session.operatorUserId);
      if (r.session.lockedAt) setMode("locked");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sentence = useCallback((reason: unknown) => (typeof reason === "string" && copy.refusal[reason]) || copy.refusal.unavailable || "", [copy.refusal]);

  const lock = useCallback(() => {
    if (!deviceKey) {
      // Storage refused a key: the till cannot be told apart from another,
      // so the lock says so instead of silently doing nothing.
      setMode("locked");
      setStatus(sentence("unavailable"));
      return;
    }
    setBusy(true);
    setStatus(null);
    void posLockTill({ deviceKey })
      .then((r) => {
        if (r.ok) {
          setMode("locked");
          setPin("");
          setSelectedId(operatorUserId ?? withPins[0]?.userId ?? null);
        } else {
          setStatus(sentence(r.reason));
        }
      })
      .finally(() => setBusy(false));
  }, [deviceKey, operatorUserId, sentence, withPins]);

  const openSwitch = useCallback(() => {
    setMode("switch");
    setPin("");
    setStatus(null);
    setSelectedId(withPins.find((p) => p.userId !== operatorUserId)?.userId ?? withPins[0]?.userId ?? null);
  }, [operatorUserId, withPins]);

  const submit = useCallback(
    (fullPin: string) => {
      if (!deviceKey || !selectedId) return;
      setBusy(true);
      setStatus(null);
      const call = mode === "switch" ? posSwitchOperator : posUnlockTill;
      void call({ deviceKey, pin: fullPin, userId: selectedId })
        .then((r) => {
          if (r.ok) {
            setOperatorUserId(r.session.operatorUserId);
            setMode("open");
            setPin("");
          } else {
            setPin("");
            setStatus(sentence(r.reason));
          }
        })
        .finally(() => setBusy(false));
    },
    [deviceKey, mode, selectedId, sentence],
  );

  // A PIN is 4 to 6 digits, so four dots are not yet an answer: the pad
  // fills to six (which submits on its own) and the Unlock action submits
  // whatever is typed from four up.
  const onKey = (key: string) => {
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!/^[0-9]$/.test(key) || busy || pin.length >= 6) return;
    setStatus(null);
    const next = pin + key;
    setPin(next);
    if (next.length === 6) submit(next);
  };

  const operatorName = input.people.find((p) => p.userId === operatorUserId)?.name || input.signedInName;
  const overlay =
    mode === "open" ? null : (
      <LockScreen
        mode={mode}
        people={withPins}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setPin("");
          setStatus(null);
        }}
        pinLength={pin.length}
        onKey={onKey}
        onSubmit={pin.length >= 4 ? () => submit(pin) : undefined}
        drawerOwnerName={input.drawerOwnerName}
        status={status}
        busy={busy}
        onCancelSwitch={mode === "switch" ? () => setMode("open") : undefined}
        peopleHref={input.peopleHref}
        copy={copy}
      />
    );

  return {
    locked: mode !== "open",
    operatorUserId,
    operatorName,
    overlay,
    lock,
    openSwitch,
  };
}
