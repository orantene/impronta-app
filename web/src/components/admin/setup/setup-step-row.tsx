import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * SetupStepRow — single row on the Setup hub. Each Agency card maps to
 * one of these. Visual contract:
 *
 *   - Numbered marker (with "✓" when completed, "•" when active, "○"
 *     when pending) at the left.
 *   - Icon tile + title + description in the centre.
 *   - Status pill on the right ("Configured", "Needs setup", "Locked").
 *   - "Open setup →" link clipped right when unlocked.
 *
 * Composable: drop a list of these inside a SetupSection on the hub
 * page. Active card visually highlights with a subtle amber band.
 */
export type SetupStepStatus =
  | "complete" // configured + good
  | "in_progress" // some setup done
  | "pending" // not started
  | "locked"; // upgrade required

export interface SetupStepRowProps {
  index: number;
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  status: SetupStepStatus;
  /** Status-line copy under the title (e.g. "Editorial Noir applied"). */
  meta?: string;
  /** Click target. When `locked`, this is ignored and the row is non-link. */
  href: string;
  active?: boolean;
}

const STATUS_PILL: Record<
  SetupStepStatus,
  { label: string; bg: string; fg: string }
> = {
  complete: {
    label: "Configured",
    bg: "rgba(20,107,58,0.10)",
    fg: "#0e4a26",
  },
  in_progress: {
    label: "In progress",
    bg: "rgba(201,162,39,0.14)",
    fg: "#7a5d12",
  },
  pending: {
    label: "Needs setup",
    bg: "rgba(20,20,24,0.06)",
    fg: "#3d3d44",
  },
  locked: {
    label: "Locked",
    bg: "rgba(20,20,24,0.05)",
    fg: "#6b6b72",
  },
};

export function SetupStepRow({
  index,
  icon: Icon,
  title,
  description,
  status,
  meta,
  href,
  active,
}: SetupStepRowProps) {
  const Wrapper: React.ElementType = status === "locked" ? "div" : Link;
  const wrapperProps =
    status === "locked"
      ? ({ "aria-disabled": true } as { "aria-disabled": boolean })
      : ({ href } as { href: string });
  const pill = STATUS_PILL[status];

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "group relative flex items-center gap-4 rounded-[12px] border bg-white px-4 py-3.5 transition-[border-color,box-shadow,background-color] duration-150",
        status === "locked"
          ? "cursor-default border-[rgba(20,20,24,0.08)] opacity-80"
          : "border-[rgba(20,20,24,0.10)] hover:border-[rgba(20,20,24,0.30)] hover:bg-[rgba(255,255,255,0.96)] hover:shadow-[0_8px_24px_-18px_rgba(20,20,24,0.24)]",
        active
          ? "border-[#c9a227] shadow-[inset_0_0_0_1px_#c9a227,_0_8px_24px_-18px_rgba(201,162,39,0.4)]"
          : "",
      ].join(" ")}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={
          status === "complete"
            ? {
                backgroundColor: "rgba(20,107,58,0.14)",
                color: "#0e4a26",
              }
            : status === "locked"
              ? {
                  backgroundColor: "rgba(20,20,24,0.06)",
                  color: "#6b6b72",
                }
              : {
                  backgroundColor: active
                    ? "rgba(201,162,39,0.18)"
                    : "rgba(20,20,24,0.06)",
                  color: active ? "#7a5d12" : "#3d3d44",
                }
        }
        aria-hidden
      >
        {status === "complete" ? (
          <Check className="size-4" strokeWidth={2.6} />
        ) : status === "locked" ? (
          <Lock className="size-3.5" />
        ) : (
          index
        )}
      </span>

      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: "linear-gradient(180deg, #fffdf6, #f0ecdf)",
          color: "#0b0b0d",
          boxShadow: "inset 0 0 0 1px rgba(20,20,24,0.08)",
        }}
        aria-hidden
      >
        <Icon className="size-[16px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold tracking-[-0.005em] text-foreground">
          {title}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] leading-[1.4] text-muted-foreground">
          {meta ? (
            <span className="text-foreground/75">{meta}</span>
          ) : (
            description
          )}
        </p>
      </div>

      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ backgroundColor: pill.bg, color: pill.fg }}
      >
        {pill.label}
      </span>

      {status !== "locked" ? (
        <ArrowRight
          className="size-3.5 shrink-0 text-muted-foreground/70 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      ) : null}
    </Wrapper>
  );
}
