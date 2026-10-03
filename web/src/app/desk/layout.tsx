/**
 * Support Desk host shell — full-bleed, no Platform Admin chrome.
 * Auth + flag are enforced in `page.tsx` via `loadDeskPage`.
 */

export default function SupportDeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-admin-surface text-admin-ink antialiased">
      {children}
    </div>
  );
}
