/**
 * Premium detail group card for LightProfileLayout.
 * GRK-052: hideGroupTitle when the section heading already names the group.
 */

export type DetailCardRow = { key: string; label: string; value: string };

export function DetailCard({
  rows,
  group,
  hideGroupTitle = false,
}: {
  group: string;
  rows: DetailCardRow[];
  hideGroupTitle?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--plt-radius-lg)] border p-5"
      style={{
        borderColor: "var(--plt-hairline)",
        background: "var(--plt-bg-raised)",
      }}
    >
      {hideGroupTitle ? null : (
        <p
          className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {group}
        </p>
      )}
      <dl
        className={`grid gap-x-6 gap-y-3.5 sm:grid-cols-2 ${hideGroupTitle ? "" : "mt-4"}`}
      >
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <dt
              className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--plt-muted-soft)" }}
            >
              {r.label}
            </dt>
            <dd className="text-sm font-medium" style={{ color: "var(--plt-ink)" }}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
