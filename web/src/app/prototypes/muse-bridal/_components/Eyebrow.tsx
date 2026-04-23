/**
 * Small uppercase label used above editorial headings.
 *
 * Variant:
 *   - `dark` (default) — for ivory/champagne backgrounds.
 *   - `light` — for espresso/deep backgrounds.
 */
export function Eyebrow({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <span className={`muse-eyebrow${tone === "light" ? " muse-eyebrow--light" : ""}`}>
      {children}
    </span>
  );
}
