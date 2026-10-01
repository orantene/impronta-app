/**
 * "Download my data" row, shared by client settings and the workspace owner
 * settings. Plain links to /api/account/export (JSON, or ?format=csv for a zip
 * of CSV files). Self-contained EN/ES copy, same approach as AccountDeletionCard.
 */

const COPY = {
  en: {
    title: "Download my data",
    body: "Get a copy of the personal data we hold about you.",
    json: "Download (JSON)",
    csv: "Download as CSV",
  },
  es: {
    title: "Descargar mis datos",
    body: "Obtén una copia de los datos personales que tenemos sobre ti.",
    json: "Descargar (JSON)",
    csv: "Descargar como CSV",
  },
} as const;

export const ACCOUNT_EXPORT_HREF = { json: "/api/account/export", csv: "/api/account/export?format=csv" } as const;

export function accountExportCopy(es: boolean) {
  return es ? COPY.es : COPY.en;
}

export function AccountExportLinks({ es }: { es: boolean }) {
  const c = accountExportCopy(es);
  const link = { fontSize: 13, fontWeight: 600, textDecoration: "underline" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12.5, opacity: 0.7 }}>{c.body}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <a href={ACCOUNT_EXPORT_HREF.json} download style={link}>{c.json}</a>
        <a href={ACCOUNT_EXPORT_HREF.csv} download style={link}>{c.csv}</a>
      </div>
    </div>
  );
}
