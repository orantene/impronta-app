import type { ReactNode } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg";

/**
 * Avatar + arbitrary text block (name lines, metadata). Use for dashboard shell and tables.
 */
export function DashboardPersonInline({
  avatarUrl,
  name,
  avatarSize = "md",
  align = "start",
  className,
  children,
}: {
  avatarUrl?: string | null;
  /** Used for initials fallback and image alt text. */
  name: string | null;
  avatarSize?: AvatarSize;
  align?: "start" | "center";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-3",
        align === "center" ? "items-center" : "items-start",
        className,
      )}
    >
      <UserAvatar src={avatarUrl} name={name} size={avatarSize} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
