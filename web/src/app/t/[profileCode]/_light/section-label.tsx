/**
 * Shared section eyebrow for the public talent profile body.
 * Forest-tinted uppercase label, --plt tokens. Server component.
 */

export function LightSectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="plt-mono text-[0.6875rem] font-semibold uppercase tracking-[0.22em]"
      style={{ color: "var(--plt-forest)" }}
    >
      {children}
    </h2>
  );
}
