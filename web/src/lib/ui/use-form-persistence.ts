"use client";

import { useEffect, useRef } from "react";

/**
 * Persist a form's field values to localStorage as the user types (E.7).
 *
 * Wraps the form so that:
 *  - On mount, every named input/textarea/select that has no value yet
 *    gets restored from localStorage["onboarding.draft.<step>:<name>"]
 *  - Every `input` / `change` event captures the latest value
 *  - When `clearOnUnmount` is true (default false), the saved draft is
 *    cleared on unmount — pass true after a confirmed successful submit
 *
 * The keyspace is namespaced by `step` so different onboarding screens
 * don't collide. Skips file inputs and password fields for safety.
 *
 * Usage:
 *   const formRef = useRef<HTMLFormElement>(null);
 *   useFormPersistence(formRef, { step: "talent-location" });
 *
 *   <form ref={formRef} action={formAction}>...</form>
 */
export type FormPersistenceOptions = {
  step: string;
  /** Skip these field names (no persistence — useful for honeypots, captcha). */
  exclude?: string[];
  /** Clear stored values on unmount. Set true after a confirmed submit. */
  clearOnUnmount?: boolean;
};

const NS = "onboarding.draft";
const SKIPPED_TYPES = new Set(["file", "password", "submit", "button", "hidden"]);

function keyOf(step: string, name: string): string {
  return `${NS}.${step}:${name}`;
}

export function useFormPersistence(
  formRef: React.RefObject<HTMLFormElement | null>,
  opts: FormPersistenceOptions,
): void {
  const optsRef = useRef(opts);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || typeof window === "undefined") return;
    const exclude = new Set(optsRef.current.exclude ?? []);

    // Restore on mount.
    const fields = Array.from(form.elements) as HTMLElement[];
    for (const el of fields) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      const name = el.getAttribute("name");
      if (!name) continue;
      if (exclude.has(name)) continue;
      if (el instanceof HTMLInputElement && SKIPPED_TYPES.has(el.type)) continue;
      if (el.value) continue; // don't overwrite values populated by defaultValue / SSR
      try {
        const saved = window.localStorage.getItem(keyOf(optsRef.current.step, name));
        if (saved !== null) {
          if (el instanceof HTMLInputElement && el.type === "checkbox") {
            el.checked = saved === "1";
          } else {
            el.value = saved;
          }
        }
      } catch {
        /* localStorage blocked — silently degrade */
      }
    }

    const onChange = (evt: Event) => {
      const target = evt.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      const name = target.getAttribute("name");
      if (!name) return;
      if (exclude.has(name)) return;
      if (target instanceof HTMLInputElement && SKIPPED_TYPES.has(target.type)) return;
      try {
        const key = keyOf(optsRef.current.step, name);
        if (target instanceof HTMLInputElement && target.type === "checkbox") {
          window.localStorage.setItem(key, target.checked ? "1" : "0");
        } else {
          window.localStorage.setItem(key, target.value);
        }
      } catch {
        /* localStorage blocked */
      }
    };

    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);

    return () => {
      form.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
      if (optsRef.current.clearOnUnmount) {
        clearFormPersistence(optsRef.current.step);
      }
    };
  }, [formRef]);
}

/**
 * Explicitly clear all stored values for a given step. Call this after
 * a successful submit to avoid stale drafts.
 */
export function clearFormPersistence(step: string): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `${NS}.${step}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {
    /* localStorage blocked */
  }
}
