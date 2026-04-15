import Image from "next/image";
import { cn } from "@/lib/utils";

function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-16 text-lg",
};

const IMG_SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 36,
  lg: 64,
};

export function UserAvatar({
  src,
  name,
  size = "md",
  className,
  rounded = "full",
}: {
  src?: string | null;
  name: string | null;
  size?: AvatarSize;
  className?: string;
  rounded?: "full" | "xl";
}) {
  const px = IMG_SIZES[size];
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-xl";

  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? ""}
        width={px}
        height={px}
        className={cn(
          roundedClass,
          "shrink-0 border border-border/50 object-cover shadow-sm ring-1 ring-border/35",
          SIZE_CLASSES[size].replace(/text-\[?\d+[^\]]*\]?/g, ""),
          className,
        )}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-display font-semibold shadow-sm ring-1 ring-border/35",
        roundedClass,
        "bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
