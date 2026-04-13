import { ClientWorkspaceShell } from "@/app/(dashboard)/client/client-workspace-shell";
import { loadClientDashboardData } from "@/lib/client-dashboard-data";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let result: Awaited<ReturnType<typeof loadClientDashboardData>>;
  try {
    result = await loadClientDashboardData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive">Client workspace failed to load</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-foreground">
            {msg}
          </pre>
          {stack ? (
            <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-muted-foreground">
              {stack}
            </pre>
          ) : null}
        </div>
        {children}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <>
        {result.reason === "no_supabase" ? (
          <p className="text-sm text-muted-foreground">Supabase not configured.</p>
        ) : null}
        {children}
      </>
    );
  }

  const { data } = result;

  return (
    <ClientWorkspaceShell
      summary={{
        displayLabel: data.profile?.display_name ?? data.userEmail ?? "Client account",
        savedCount: data.saves.length,
        inquiryCount: data.inquiries.length,
      }}
    >
      {children}
    </ClientWorkspaceShell>
  );
}
