"use client";

/**
 * Talent Registration Modal — WIREFRAME
 *
 * Cross-component trigger: any client component can call
 * `window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT))` or render a
 * `<TalentModalTrigger>` to open the modal that lives in the header.
 */

export const TALENT_MODAL_EVENT = "tulala:open-talent-modal" as const;

/** Render a button that opens the talent register modal from anywhere. */
export function TalentModalTrigger({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() =>
        window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT))
      }
    >
      {children}
    </button>
  );
}

/**
 * Talent Registration Modal — WIREFRAME
 *
 * Structural placeholder for the talent sign-up flow. No visual design applied
 * yet — dashed borders, gray placeholders, neutral colors only. Replace with
 * the real RegisterForm + brand styles in the design pass.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

interface TalentRegisterModalProps {
  onClose: () => void;
}

export function TalentRegisterModal({ onClose }: TalentRegisterModalProps) {
  const [mounted, setMounted] = useState(false);

  // Only render on the client (createPortal needs document.body).
  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!mounted) return null;

  // Portal out of the header so backdrop-filter doesn't create a containing
  // block that breaks fixed positioning on the backdrop + dialog.
  return createPortal(
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[200] bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* ── Dialog ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="talent-modal-title"
        className="fixed inset-x-4 top-1/2 z-[201] mx-auto w-full max-w-md -translate-y-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      >
        {/* Header row */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              Free · No credit card
            </p>
            <h2
              id="talent-modal-title"
              className="text-[1.125rem] font-semibold text-gray-900"
            >
              Join as Talent
            </h2>
            <p className="mt-0.5 text-sm text-gray-400">
              Create a profile, join a roster, receive bookings.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-4 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[0.75rem] text-gray-400 hover:border-gray-300 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Google OAuth — wireframe box */}
          <div className="mb-4 flex h-10 items-center justify-center gap-2.5 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
            <WireframeCircle />
            Sign up with Google
          </div>

          {/* OR divider */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              or
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Email field */}
          <WireframeField label="Email" hint={null} />

          {/* Password field */}
          <div className="mt-3">
            <WireframeField label="Password" hint="At least 8 characters" />
          </div>

          {/* Submit */}
          <div className="mt-4 flex h-10 items-center justify-center rounded-md bg-gray-800 text-sm font-medium text-white">
            Sign up with email
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-[0.8125rem] text-gray-400">
            Already have an account?{" "}
            <Link
              href="/login"
              onClick={onClose}
              className="underline underline-offset-2 hover:text-gray-700"
            >
              Log in
            </Link>
          </p>
        </div>

        {/* Annotation strip — wireframe label */}
        <div className="border-t border-dashed border-gray-200 bg-gray-50 px-6 py-2.5">
          <p className="text-center text-[10px] uppercase tracking-[0.18em] text-gray-300">
            Wireframe · design pass next
          </p>
        </div>
      </div>
    </>,
    document.body
  );
}

function WireframeCircle() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 rounded-full border-2 border-dashed border-gray-300"
    />
  );
}

function WireframeField({
  label,
  hint,
}: {
  label: string;
  hint: string | null;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-gray-500">{label}</p>
      <div className="h-9 rounded-md border-2 border-dashed border-gray-200 bg-gray-50" />
      {hint ? <p className="mt-1 text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}
