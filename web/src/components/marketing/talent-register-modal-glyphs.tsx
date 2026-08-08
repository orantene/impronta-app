/**
 * Inline SVG glyphs for the talent registration + login modals. Split out to
 * keep the modal components under the file-size lint cap; no logic, pure
 * presentation.
 *
 * P2: `ArrowGlyph`, `Spinner` and `GoogleGlyph` used to be a second copy of the
 * SVGs that `components/auth/auth-ui.tsx` and `auth-google-glyph.tsx` already
 * ship for the standalone `(auth)` pages. Two copies of the same mark is
 * exactly how the modal and `/register` drifted apart in the first place, so
 * they are now aliases of the single implementation. Only glyphs unique to the
 * modals (close, check, mail, trust tick) are defined here.
 */
import {
  AuthArrowGlyph,
  AuthSpinner,
} from "@/components/auth/auth-ui";
import { AuthGoogleGlyph } from "@/components/auth/auth-google-glyph";

export {
  AuthArrowGlyph as ArrowGlyph,
  AuthSpinner as Spinner,
  AuthGoogleGlyph as GoogleGlyph,
};

export function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 1L13 13M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.5 12.5L10.5 15.5L16.5 9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrustTick() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.25" stroke="var(--plt-forest)" strokeWidth="1.2" />
      <path
        d="M4.5 7.25L6.2 9L9.5 5.5"
        stroke="var(--plt-forest)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

