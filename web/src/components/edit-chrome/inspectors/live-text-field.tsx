"use client";

/**
 * TUL-78 #11 — plain inspector text input / textarea that updates the canvas
 * while you type (debounced) instead of only on blur, like the rich text
 * fields already do.
 *
 * It is keyed by node + prop + locale, NOT by the saved value: the old fields
 * remounted on every save, which would drop focus mid-typing once saves became
 * live (and sent Tab to the canvas). External value changes (undo, locale
 * switch) re-seed the draft only while the field is not focused.
 */

import { useEffect, useRef, useState } from "react";

import { LIVE_TEXT_DEBOUNCE_MS, liveTextCommitValue } from "./live-text-commit";

export function LiveTextField({
  multiline,
  value,
  allowEmpty,
  className,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  multiline: boolean;
  value: string;
  allowEmpty: boolean;
  className: string;
  placeholder?: string;
  ariaLabel: string;
  onCommit: (next: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = liveTextCommitValue({ draft, saved: value, allowEmpty });
    if (next === null) return;
    const timer = window.setTimeout(() => void onCommitRef.current(next), LIVE_TEXT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value, allowEmpty]);

  const flush = (current: string) => {
    const next = liveTextCommitValue({ draft: current, saved: value, allowEmpty });
    if (next !== null) void onCommitRef.current(next);
  };

  const common = {
    ref,
    value: draft,
    className,
    placeholder,
    "aria-label": ariaLabel,
    onChange: (event: { currentTarget: { value: string } }) => setDraft(event.currentTarget.value),
    onBlur: (event: { currentTarget: { value: string } }) => flush(event.currentTarget.value),
  };

  if (multiline) return <textarea {...common} />;
  return (
    <input
      {...common}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        flush(event.currentTarget.value);
        event.currentTarget.blur();
      }}
    />
  );
}
