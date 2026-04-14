import { cn } from "@/lib/utils";

type ListRowBase = {
  className?: string;
  children: React.ReactNode;
};

type ListRowDivProps = ListRowBase &
  React.ComponentPropsWithoutRef<"div"> & { as?: "div" };

type ListRowButtonProps = ListRowBase &
  React.ComponentPropsWithoutRef<"button"> & { as: "button" };

export type ListRowProps = ListRowDivProps | ListRowButtonProps;

export function ListRow(props: ListRowProps) {
  const { className, children, as = "div", ...rest } = props;
  const base =
    "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/30";

  if (as === "button") {
    const btn = rest as React.ComponentPropsWithoutRef<"button">;
    return (
      <button
        type="button"
        className={cn(
          base,
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...btn}
      >
        {children}
      </button>
    );
  }

  const div = rest as React.ComponentPropsWithoutRef<"div">;
  return (
    <div className={cn(base, className)} {...div}>
      {children}
    </div>
  );
}
