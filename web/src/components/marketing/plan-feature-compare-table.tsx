/**
 * PlanFeatureCompareTable — renders the full per-tier feature matrix on
 * the marketing /pricing page (L50 Phase 4).
 *
 * Replaces the hard-coded SECTIONS const that used to live in
 * `web/src/app/(marketing)/pricing/page.tsx`. Operators now edit rows
 * from /platform/admin/commerce?tab=catalog; this
 * surface is the read side.
 *
 * Server component. Loads the table via `loadCompareTable("workspace")`
 * and renders both a desktop grid layout AND a mobile stacked layout
 * (matches the prior page's responsive strategy 1:1).
 *
 * Featured-column highlighting: the `featuredTierSlug` prop tints that
 * column's tier name forest-green to mirror the prior page's behavior
 * where the Agency column was emphasized.
 */

import { loadCompareTable } from "@/lib/pricing/get-compare-table";
import {
  COMPARE_CATEGORY_LABEL,
  type CompareTableRow,
} from "@/lib/pricing/pricing-types";

export async function PlanFeatureCompareTable({
  packageSlug = "workspace",
  featuredTierSlug = "agency",
  tierCaptions,
}: {
  packageSlug?: string;
  featuredTierSlug?: string;
  /** Optional one-line subtitle per tier (rendered under the tier name
   *  in the desktop header). Defaults are hard-coded — pass to override
   *  per surface. */
  tierCaptions?: Record<string, string>;
}) {
  const table = await loadCompareTable(packageSlug);
  if (!table || table.tierSlugs.length === 0) {
    return (
      <div
        className="rounded-2xl border p-8 text-center text-[0.9375rem]"
        style={{
          borderColor: "var(--plt-hairline)",
          background: "var(--plt-bg-elevated)",
          color: "var(--plt-muted)",
        }}
      >
        Plan-comparison data isn&rsquo;t available right now. Check{" "}
        <code>/platform/admin/commerce?tab=discounts</code> &rarr; to add
        per-tier feature rows.
      </div>
    );
  }

  const captions = tierCaptions ?? DEFAULT_CAPTIONS;
  const columnCount = table.tierSlugs.length;
  // Tailwind class for grid: 1 feature-label col + N tier cols, all flex-1.
  const gridTemplate = `1.5fr ${"1fr ".repeat(columnCount).trim()}`;

  return (
    <div
      className="overflow-hidden rounded-[28px] border"
      style={{
        borderColor: "var(--plt-hairline-strong)",
        background: "var(--plt-bg-elevated)",
        boxShadow: "0 30px 60px -40px rgba(15,23,20,0.2)",
      }}
    >
      {/* Desktop grid table */}
      <div className="hidden md:block">
        <div
          className="grid items-end gap-x-4 border-b px-8 py-6"
          style={{
            gridTemplateColumns: gridTemplate,
            borderColor: "var(--plt-hairline)",
          }}
        >
          <span
            className="plt-mono text-[0.6875rem] uppercase tracking-[0.24em]"
            style={{ color: "var(--plt-muted)" }}
          >
            Feature
          </span>
          {table.tierSlugs.map((slug) => (
            <div key={slug}>
              <span
                className="plt-display text-[1.25rem] font-medium tracking-[-0.02em]"
                style={{
                  color:
                    slug === featuredTierSlug
                      ? "var(--plt-forest)"
                      : "var(--plt-ink)",
                }}
              >
                {table.tierLabels[slug]}
              </span>
              {captions[slug] && (
                <p
                  className="mt-1 text-[0.75rem] leading-[1.4]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {captions[slug]}
                </p>
              )}
            </div>
          ))}
        </div>

        {table.sections.map((section) => (
          <div key={section.category}>
            <div
              className="plt-mono px-8 py-3 text-[0.6875rem] uppercase tracking-[0.24em]"
              style={{
                background: "var(--plt-bg-deep)",
                color: "var(--plt-forest)",
              }}
            >
              {COMPARE_CATEGORY_LABEL[section.category] ?? section.category}
            </div>
            <ul>
              {section.rows.map((row) => (
                <li
                  key={row.label}
                  className="grid items-center gap-x-4 border-b px-8 py-4 text-[0.9375rem] last:border-b-0"
                  style={{
                    gridTemplateColumns: gridTemplate,
                    borderColor: "var(--plt-hairline)",
                  }}
                >
                  <span style={{ color: "var(--plt-ink)" }}>{row.label}</span>
                  {row.cells.map((c, i) => (
                    <Cell key={i} cell={c} />
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Mobile stacked */}
      <div className="md:hidden">
        {table.tierSlugs.map((slug, tierIdx) => (
          <div
            key={slug}
            className="border-b last:border-b-0"
            style={{ borderColor: "var(--plt-hairline)" }}
          >
            <div className="flex items-baseline justify-between px-6 pt-6">
              <span
                className="plt-display text-[1.375rem] font-medium tracking-[-0.02em]"
                style={{
                  color:
                    slug === featuredTierSlug
                      ? "var(--plt-forest)"
                      : "var(--plt-ink)",
                }}
              >
                {table.tierLabels[slug]}
              </span>
              <span
                className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                style={{ color: "var(--plt-muted)" }}
              >
                Tier {String(tierIdx + 1).padStart(2, "0")}
              </span>
            </div>
            {captions[slug] && (
              <p
                className="px-6 pt-1 text-[0.8125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {captions[slug]}
              </p>
            )}
            <div className="space-y-5 px-6 pb-6 pt-4">
              {table.sections.map((section) => (
                <div key={section.category}>
                  <div
                    className="plt-mono text-[0.625rem] uppercase tracking-[0.22em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {COMPARE_CATEGORY_LABEL[section.category] ?? section.category}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {section.rows.map((row) => {
                      const cell = row.cells[tierIdx];
                      return (
                        <li
                          key={row.label}
                          className="flex items-center justify-between gap-4 text-[0.8125rem]"
                        >
                          <span style={{ color: "var(--plt-ink-soft)" }}>
                            {row.label}
                          </span>
                          <span className="shrink-0">
                            <Cell cell={cell} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_CAPTIONS: Record<string, string> = {
  free:   "Every operator, forever.",
  studio: "Solo + small team, on WhatsApp.",
  agency: "Teams running representation.",
  hub:    "Staffing, casting, and scale.",
};

function Cell({ cell }: { cell: CompareTableRow["cells"][number] }) {
  if ("missing" in cell || !cell.included) {
    return (
      <span
        className="text-[0.875rem]"
        style={{ color: "var(--plt-muted-soft)" }}
        aria-label="Not included"
      >
        &mdash;
      </span>
    );
  }
  if (cell.value) {
    return (
      <span
        className="text-[0.875rem] font-medium"
        style={{ color: "var(--plt-ink-soft)" }}
      >
        {cell.value}
      </span>
    );
  }
  // included=true, no value_text → check mark
  return (
    <span className="flex items-center" aria-label="Included">
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full"
        style={{
          background: "rgba(46,107,82,0.14)",
          color: "var(--plt-forest)",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path
            d="M2 5.8l2.4 2.4L9 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
