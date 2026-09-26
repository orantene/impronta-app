"use client";

/**
 * IdentityCaptureWire (boards D04, M07): the kit IdentityCaptureCard bound to
 * `messagingMatchCustomers` (match, never merge) and `messagingCaptureIdentity`
 * (link the thread to the chosen existing client). "Create a new client" goes
 * through `messagingCreateClientForThread` (ensureCustomer + set identity).
 */

import { useEffect, useRef, useState } from "react";

import { messagingCaptureIdentity, messagingMatchCustomers } from "@/lib/server-actions/messaging-identity";
import { messagingCreateClientForThread } from "@/lib/server-actions/messaging-start";
import type { ActionResult, CustomerMatch, Essentials, MessagingRefusal } from "@/lib/messaging/types";

import { IdentityCaptureCard, type IdentityCaptureState } from "../kit/IdentityCaptureCard";
import type { ScreenVariant } from "./contracts";
import type { ScreenCopy } from "./copy";

export type IdentityActions = {
  readonly match: (input: { inquiryId: string; name: string; phone: string; email: string }) => Promise<ActionResult<{ matches: CustomerMatch[] }>>;
  readonly capture: (input: { inquiryId: string; level: "linked" | "confirmed"; method: "phone" | "email" | "name_only"; customerId: string | null; expectedVersion: number }) => Promise<ActionResult<{ version?: number }>>;
  readonly createClient: (input: { inquiryId: string; name: string; phone: string | null; email: string | null; expectedVersion: number }) => Promise<ActionResult<{ version?: number }>>;
};

export const engineIdentityActions: IdentityActions = {
  match: (input) => messagingMatchCustomers({ inquiryId: input.inquiryId, name: input.name || null, phone: input.phone || null, email: input.email || null }),
  capture: (input) => messagingCaptureIdentity(input),
  createClient: (input) => messagingCreateClientForThread(input),
};

export type IdentityCaptureWireProps = {
  readonly inquiryId: string;
  readonly version: number;
  readonly essentials: Essentials | null;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly actions?: IdentityActions;
  readonly onDone: (version: number | null) => void;
  /** Kept for callers; every choice is wired now. */
  readonly onComing?: (seam: string) => void;
};

export function IdentityCaptureWire({ inquiryId, version, essentials, copy, variant, onDone, ...rest }: IdentityCaptureWireProps) {
  const actions = rest.actions ?? engineIdentityActions;
  const [name, setName] = useState(essentials?.customer.name ?? "");
  const [phone, setPhone] = useState(essentials?.customer.phone ?? "");
  const [email, setEmail] = useState(essentials?.customer.email ?? "");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [selected, setSelected] = useState<string>("new");
  const [state, setState] = useState<IdentityCaptureState>("idle");
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);

  // Match 400ms after the last keystroke. `state` is read through a ref so
  // the matching → idle flip does not re-arm the timer (that would loop).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!name.trim() && !phone.trim() && !email.trim()) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (stateRef.current !== "idle") return;
      setState("matching");
      void actions.match({ inquiryId, name: name.trim(), phone: phone.trim(), email: email.trim() }).then((result) => {
        if (!alive) return;
        if (result.ok) {
          const found = result.matches.filter((m) => m.customerId);
          setMatches(found);
          setSelected((cur) => (found.some((m) => m.customerId === cur) ? cur : found[0]?.level === "phone" && found[0].customerId ? found[0].customerId : "new"));
        }
        setState((s) => (s === "matching" ? "idle" : s));
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [actions, inquiryId, name, phone, email]);

  const save = async () => {
    if (state === "saving") return;
    setState("saving");
    setRefusal(null);
    const method = phone.trim() ? "phone" : email.trim() ? "email" : "name_only";
    const result =
      selected === "new"
        ? await actions.createClient({ inquiryId, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, expectedVersion: version })
        : await actions.capture({ inquiryId, level: "confirmed", method, customerId: selected, expectedVersion: version });
    if (!result.ok) {
      setRefusal(result.reason);
      setState("refused");
      return;
    }
    setLinkedName(matches.find((m) => m.customerId === selected)?.displayName ?? name);
    setState("done");
    onDone(typeof result.version === "number" ? result.version : null);
  };

  return (
    <IdentityCaptureCard
      name={name}
      phone={phone}
      email={email}
      matches={matches}
      selected={selected}
      state={state}
      refusal={refusal}
      linkedName={linkedName}
      copy={copy.kit}
      variant={variant}
      onChange={(field, value) => {
        if (field === "name") setName(value);
        else if (field === "phone") setPhone(value);
        else setEmail(value);
      }}
      onSelect={setSelected}
      onSave={() => void save()}
    />
  );
}
