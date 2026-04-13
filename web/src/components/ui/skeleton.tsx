import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[rgba(255,255,255,0.06)]",
        className,
      )}
      {...props}
    />
  );
}
