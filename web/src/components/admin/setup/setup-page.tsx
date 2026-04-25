import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode, SVGProps } from "react";

/**
 * SetupPage — premium chrome shared by every Site Setup surface.
 *
 * Visual contract (matches the Theme & foundations mockup):
 *   - Soft cream background panel that runs edge-to-edge inside the admin
 *     content frame; child surfaces float on it.
 *   - Eyebrow ("SETUP" in caps) + big serif-feel title + 2-line description.
 *   - Optional rounded-square icon tile to the left of the title block,
 *     visually anchoring the page identity.
 *   - "← Back to Site" link top-right that returns the operator to the
 *     /admin/site cards.
 *
 * The component is presentational only — it owns no fetch, no client
 * state, just composition. The Setup hub (`/admin/site/setup`) and the
 * per-card pages drop their content into `children`.
 */
export interface SetupPageProps {
  /** Small caps eyebrow above the title. Defaults to "SETUP". */
  eyebrow?: string;
  /** Page title — large serif-feel display. */
  title: string;
  /** Two-line max description, neutral tone. */
  description: ReactNode;
  /**
   * Optional icon tile shown to the left of the title block. Pass a
   * Lucide icon component or a custom SVG element.
   */
  icon?: LucideIcon | ((props: SVGProps<SVGSVGElement>) => ReactElement);
  /**
   * Where the "Back to" link points. Defaults to `/admin/site`. Pass a
   * different href when nesting setup pages (e.g. inside the hub).
   */
  backHref?: string;
  /** Override the back link copy. Defaults to "Back to Site". */
  backLabel?: string;
  /**
   * Optional supplemental content shown in the header row (e.g. a status
   * pill, a "View live" link). Sits to the left of the back link.
   */
  headerExtras?: ReactNode;
  children: ReactNode;
}

export function SetupPage({
  eyebrow = "SETUP",
  title,
  description,
  icon: Icon,
  backHref = "/admin/site",
  backLabel = "Back to Site",
  headerExtras,
  children,
}: SetupPageProps) {
  return (
    <div
      className="min-h-[calc(100vh-110px)] -mx-4 -mt-4 px-6 pt-8 pb-16 sm:-mx-6 sm:px-10 lg:-mx-8 lg:px-14"
      style={{
        background:
          "linear-gradient(180deg, #f4f1ea 0%, #f7f5ee 35%, #faf8f1 100%)",
      }}
    >
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-5">
          {Icon ? (
            <span
              className="flex size-[60px] shrink-0 items-center justify-center rounded-[14px]"
              style={{
                background:
                  "linear-gradient(180deg, #fffdf6, #f0ecdf)",
                color: "#0b0b0d",
                boxShadow:
                  "inset 0 0 0 1px rgba(20,20,24,0.08), 0 6px 18px -10px rgba(20,20,24,0.18)",
              }}
              aria-hidden
            >
              <Icon className="size-[26px]" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p
              className="text-[10.5px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "rgba(70,68,60,0.75)" }}
            >
              {eyebrow}
            </p>
            <h1
              className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.012em] text-foreground sm:text-[40px]"
              style={{
                fontFamily:
                  '"Cormorant Garamond", "EB Garamond", "Georgia", serif',
                letterSpacing: "-0.012em",
              }}
            >
              {title}
            </h1>
            <p className="mt-3 max-w-[640px] text-[14px] leading-[1.55] text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-2">
          {headerExtras}
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel}
          </Link>
        </div>
      </header>

      <div className="mx-auto mt-10 w-full max-w-6xl">{children}</div>
    </div>
  );
}

/**
 * Section block inside a SetupPage. Provides the small-caps section label
 * + helper text + a horizontal hairline that bleeds into the panel.
 */
export function SetupSection({
  label,
  helper,
  right,
  children,
}: {
  label: string;
  helper?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
          {label}
        </h2>
        {helper ? (
          <span className="text-[12px] text-muted-foreground">{helper}</span>
        ) : null}
        <div
          aria-hidden
          className="hidden h-px min-w-[40px] flex-1 sm:block"
          style={{
            background:
              "linear-gradient(to right, rgba(20,20,24,0.18), transparent 80%)",
          }}
        />
        {right}
      </div>
      {children}
    </section>
  );
}
