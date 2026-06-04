/**
 * ProfileHubsIndicator — "Also represented on" pill row.
 *
 * A talent may sit on multiple Tulala workspaces/hubs. page.tsx resolves the
 * OTHER active + publicly-visible rosters (excluding the current tenant) and
 * passes them here as pre-built links. Renders nothing when there are none.
 *
 * Server component — pure presentational, --plt tokens only.
 */

export type ProfileHubLink = {
  tenantId: string;
  name: string;
  /** Absolute URL to this talent's profile on the other hub. */
  href: string;
};

export function ProfileHubsIndicator({
  hubs,
  label,
}: {
  hubs: ProfileHubLink[];
  label: string;
}) {
  if (hubs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <span
        className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.18em]"
        style={{ color: "var(--plt-muted-soft)" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {hubs.map((hub) => (
          <a
            key={hub.tenantId}
            href={hub.href}
            className="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-[transform,color,border-color,background] hover:-translate-y-[1px]"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              background: "var(--plt-bg-raised)",
              color: "var(--plt-ink)",
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--plt-forest)" }}
              aria-hidden
            />
            {hub.name}
            <svg
              aria-hidden
              width="10"
              height="8"
              viewBox="0 0 14 10"
              fill="none"
              className="-translate-x-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
              style={{ color: "var(--plt-forest)" }}
            >
              <path
                d="M1 5H13M13 5L9 1M13 5L9 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
