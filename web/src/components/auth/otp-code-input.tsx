"use client";

/**
 * One box per digit for the emailed code.
 *
 * Behaves the way people expect from a phone: typing advances, backspace on
 * an empty box steps back, arrows move, and pasting the whole code (or the
 * whole "your code is 20344125" line) fills every box at once. The joined
 * value is posted through a hidden `name="code"` input so the surrounding
 * server-action form stays exactly the one `submitEmailCode` already reads,
 * and `onComplete` fires once every box is filled so the form can submit
 * itself without a second tap.
 *
 * `autoComplete="one-time-code"` sits on the first box so iOS and Android
 * offer the code from the keyboard suggestion bar when they have it.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { OTP_CODE_LENGTH } from "@/lib/auth/otp-flow";

export function OtpCodeInput({
  name = "code",
  length = OTP_CODE_LENGTH,
  disabled = false,
  invalid = false,
  onComplete,
  /** Reset key: bumping it clears every box (after a resend, say). */
  resetKey = 0,
}: {
  name?: string;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  onComplete?: (code: string) => void;
  resetKey?: number;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setDigits(Array(length).fill(""));
  }
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const value = digits.join("");

  const focusBox = useCallback((i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  }, [length]);

  const commit = useCallback(
    (next: string[]) => {
      setDigits(next);
      const joined = next.join("");
      if (joined.length === length && next.every(Boolean)) onComplete?.(joined);
    },
    [length, onComplete],
  );

  const fillFrom = useCallback(
    (start: number, text: string) => {
      const incoming = text.replace(/\D+/g, "");
      if (!incoming) return;
      const next = [...digits];
      let i = start;
      for (const ch of incoming) {
        if (i >= length) break;
        next[i] = ch;
        i += 1;
      }
      commit(next);
      focusBox(Math.min(i, length - 1));
    },
    [commit, digits, focusBox, length],
  );

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) {
        next[i] = "";
        commit(next);
      } else if (i > 0) {
        next[i - 1] = "";
        commit(next);
        focusBox(i - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fillFrom(i, e.key);
    }
  };

  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fillFrom(i, e.clipboardData.getData("text"));
  };

  // Split into two groups of four when the length allows it; eight digits in
  // one run are hard to check against the email at a glance.
  const groups = useMemo(() => {
    if (length % 2 === 0 && length >= 8) return [length / 2, length / 2];
    return [length];
  }, [length]);

  let index = 0;
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <input type="hidden" name={name} value={value} />
      {groups.map((count, g) => (
        <div key={g} className="flex gap-1.5 sm:gap-2">
          {Array.from({ length: count }).map(() => {
            const i = index++;
            return (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                // No `pattern` and no `maxLength` on purpose. A pattern here
                // shipped once with a doubled backslash and constraint
                // validation then refused EVERY submit with no visible error
                // (live 2026-09-10); the digits are filtered in fillFrom, so
                // the browser has nothing to validate. No maxLength because an
                // autofill or keyboard suggestion inserts the whole code into
                // one box and fillFrom spreads it across all of them.
                autoComplete={i === 0 ? "one-time-code" : "off"}
                autoFocus={i === 0}
                aria-label={`${i + 1} / ${length}`}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                value={digits[i]}
                // Typing is handled in onKeyDown; onChange catches inserted
                // text (autofill, suggestion bar, some mobile keyboards).
                onChange={(e) => fillFrom(i, e.target.value)}
                onKeyDown={onKeyDown(i)}
                onPaste={onPaste(i)}
                onFocus={(e) => e.target.select()}
                className="h-12 w-9 rounded-xl border text-center text-[1.25rem] font-semibold tabular-nums outline-none transition-[border-color,box-shadow] focus:ring-2 disabled:opacity-60 sm:h-14 sm:w-11"
                style={{
                  borderColor: invalid
                    ? "#b42318"
                    : digits[i]
                      ? "var(--plt-forest)"
                      : "var(--plt-hairline-strong)",
                  background: "var(--plt-bg-raised)",
                  color: "var(--plt-ink)",
                  // Focus ring rides on the brand token.
                  ["--tw-ring-color" as string]:
                    "color-mix(in srgb, var(--plt-forest) 35%, transparent)",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
