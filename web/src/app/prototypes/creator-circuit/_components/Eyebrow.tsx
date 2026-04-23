import type { ReactNode } from "react";

export function Eyebrow({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "light";
}) {
  const cls =
    tone === "accent"
      ? "cc-eyebrow cc-eyebrow--accent"
      : tone === "light"
        ? "cc-eyebrow cc-eyebrow--light"
        : "cc-eyebrow";
  return <span className={cls}>{children}</span>;
}
