import { resolveDatedDetails, type DatedDetails } from "@/lib/offerings/dated-details";

/**
 * The info fields of a dated item as a definition list (TUL-1344 slice 5).
 * Renders nothing when no field has text, so a trade shows only what it filled.
 * Text is rendered as text (React escapes it); line breaks are kept.
 */
export function DatedDetailsBlock({ details, locale }: { details: DatedDetails; locale: string }) {
  const rows = resolveDatedDetails(details, locale);
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-3" data-testid="dated-details">
      {rows.map((r) => (
        <div key={r.field} className="grid gap-1">
          <dt className="text-sm font-semibold opacity-75">{r.label}</dt>
          <dd className="whitespace-pre-line">{r.field === "minAge" ? `${r.value}+` : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
