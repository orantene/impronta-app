import { cn } from "@/lib/utils";

type ActionBarProps = {
  className?: string;
  children: React.ReactNode;
};

/** Sticky-ish toolbar row for directory headers or admin table bulk actions. */
export function ActionBar({ className, children }: ActionBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
