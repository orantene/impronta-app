import type { ReactNode } from "react";

/**
 * Docs hub: sidebar + header come from the parent admin layout.
 * This wrapper keeps documentation routes in a consistent content column.
 */
export default function AdminDocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-docs-hub w-full min-w-0">
      <div className="mx-auto w-full max-w-[min(100%,120rem)] px-0">{children}</div>
    </div>
  );
}
