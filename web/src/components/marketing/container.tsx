import { cn } from "@/lib/utils";

type Size = "narrow" | "default" | "wide";

const SIZE_CLASSES: Record<Size, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
};

export function MarketingContainer({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: Size;
}) {
  return (
    <div className={cn("mx-auto w-full px-5 sm:px-8", SIZE_CLASSES[size], className)}>
      {children}
    </div>
  );
}

type Spacing = "tight" | "default" | "loose";

const SPACING_CLASSES: Record<Spacing, string> = {
  tight: "py-16 sm:py-20",
  default: "py-20 sm:py-28 md:py-32",
  loose: "py-24 sm:py-32 md:py-40",
};

export function MarketingSection({
  children,
  className,
  spacing = "default",
  as: Tag = "section",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  spacing?: Spacing;
  as?: "section" | "div";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("relative", SPACING_CLASSES[spacing], className)} {...rest}>
      {children}
    </Tag>
  );
}

export function MarketingEyebrow({
  children,
  className,
  tone = "accent",
}: {
  children: React.ReactNode;
  className?: string;
  /** `accent` = forest (default). `inverse` = cream on deep backgrounds. `muted` = slate. */
  tone?: "accent" | "inverse" | "muted";
}) {
  const toneClass =
    tone === "inverse"
      ? "text-[color:var(--plt-on-inverse-muted)]"
      : tone === "muted"
        ? "text-[color:var(--plt-muted)]"
        : "";
  return (
    <span className={cn("plt-eyebrow", toneClass, className)}>
      {tone === "accent" ? (
        <span
          className="inline-block h-1 w-1 rounded-full"
          style={{ background: "var(--plt-forest)" }}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}

export function MarketingHairline({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block h-px w-full", className)}
      style={{ background: "var(--plt-hairline)" }}
    />
  );
}
