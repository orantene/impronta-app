/**
 * Scope for /start (Onboarding 1B front door).
 *
 * /start sits outside the `(marketing)` route group, so nothing above it set
 * `data-platform-surface="marketing"`, the attribute every `--tl-*` token is
 * scoped to in globals.css. The flow paints `var(--tl-bone)` / `var(--tl-ink)`;
 * unscoped, both resolved to nothing and the text fell through to the root
 * body's dark-theme foreground: near-white text on a white page (production,
 * 2026-10-07). Same wrapper the (auth) layout and /account/brief use.
 */
export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--tl-bone)", color: "var(--tl-ink)" }}
    >
      {children}
    </div>
  );
}
