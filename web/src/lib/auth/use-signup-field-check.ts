"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  clientErrorMessage,
  firstInvalidSignupField,
  type AuthErrorField,
  type AuthErrorMessages,
} from "@/lib/auth/auth-error-field";

const FIELD_ELEMENT_ID: Record<Exclude<AuthErrorField, "form">, string> = {
  name: "full_name",
  email: "email",
  consent: "",
};

/**
 * TUL-1169: client-side signup check. Blocks the submit when a field is invalid, remembers WHICH
 * field, and moves focus to that field (the first invalid one in visual order). The caller renders
 * the message under that field only. A valid field is never flagged or focused.
 */
export function useSignupFieldCheck(
  collectName: boolean,
  messages: Required<AuthErrorMessages>,
) {
  const [clientField, setClientField] = useState<Exclude<AuthErrorField, "form"> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientField) return;
    const id = FIELD_ELEMENT_ID[clientField];
    const target = id
      ? document.getElementById(id)
      : document.querySelector<HTMLElement>('input[name="age_terms"]');
    target?.focus();
  }, [clientField, tick]);

  function onSubmit(e: FormEvent<HTMLFormElement>): boolean {
    const data = new FormData(e.currentTarget);
    const bad = firstInvalidSignupField({
      collectName,
      name: data.get("full_name"),
      email: data.get("email"),
      consent: data.get("age_terms"),
    });
    setClientField(bad);
    if (bad) {
      e.preventDefault();
      setTick((n) => n + 1);
      return false;
    }
    return true;
  }

  return {
    clientField,
    clientError: clientField ? clientErrorMessage(clientField, messages) : undefined,
    onSubmit,
  };
}
