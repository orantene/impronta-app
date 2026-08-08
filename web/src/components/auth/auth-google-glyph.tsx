/**
 * The Google "G" mark, shared by every Google sign-in affordance in the (auth)
 * shell. Previously copy-pasted in `login-google-button.tsx`,
 * `login-modal.tsx`, and `talent-register-modal-glyphs.tsx` — the standalone
 * register pages had no glyph at all, which is part of why they looked unlike
 * the modal.
 *
 * Brand-mandated literal colors (Google's own palette) — deliberately NOT
 * themed with `--plt-*` tokens.
 */
export function AuthGoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.85 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.47 1.18 4.93l3.67-2.83Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.07l3.67 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}
