import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ComparisonTableV1 } from "./schema";

function renderCell(value: string): string {
  // "yes" / "y" / "true" → ✓ ; "no" / "n" / "false" / "-" → — ; everything
  // else: render as-is.
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "✓"].includes(v)) return "✓";
  if (["no", "n", "false", "-", "—", ""].includes(v)) return "—";
  return value;
}

export function ComparisonTableComponent({
  props,
}: SectionComponentProps<ComparisonTableV1>) {
  const { eyebrow, headline, intro, columns, rows, variant, presentation } = props;
  return (
    <section
      className="site-compare"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-compare__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-compare__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-compare__headline">{renderInlineRich(headline)}</h2>
            ) : null}
            {intro ? <p className="site-compare__intro">{intro}</p> : null}
          </header>
        )}
        <div className="site-compare__scroll">
          <table className="site-compare__table">
            <thead>
              <tr>
                <th scope="col" />
                {columns.map((col, i) => (
                  <th
                    key={`c-${i}`}
                    scope="col"
                    data-highlighted={col.highlighted ? "true" : "false"}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`r-${i}`}>
                  <th scope="row">{row.feature}</th>
                  {columns.map((col, c) => {
                    const v = row.values[c] ?? "";
                    return (
                      <td
                        key={`v-${i}-${c}`}
                        data-highlighted={col.highlighted ? "true" : "false"}
                        data-truthy={
                          ["yes", "y", "true", "✓"].includes(v.trim().toLowerCase())
                            ? "true"
                            : "false"
                        }
                      >
                        {renderCell(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
