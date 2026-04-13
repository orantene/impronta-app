import { Toaster } from "sonner";
import { TalentBottomTabBar } from "@/components/talent/talent-bottom-tab-bar";
import { TalentDashboardPage } from "@/components/talent/talent-dashboard-primitives";
import { TalentStatusBanner } from "@/components/talent/talent-status-banner";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";

export default async function TalentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let result: Awaited<ReturnType<typeof loadTalentDashboardData>>;
  try {
    result = await loadTalentDashboardData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    return (
      <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <TalentDashboardPage className="py-2">
          <div className="overflow-hidden rounded-2xl border border-destructive/40 bg-gradient-to-br from-destructive/10 to-destructive/5 p-5 text-sm shadow-sm lg:p-6">
            <p className="font-display font-semibold text-destructive">Talent workspace failed to load</p>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs text-foreground">
              {msg}
            </pre>
            {stack ? (
              <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-border/30 bg-muted/20 p-3 text-[10px] leading-relaxed text-muted-foreground">
                {stack}
              </pre>
            ) : null}
          </div>
        </TalentDashboardPage>
        {children}
        <TalentBottomTabBar />
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!rounded-xl !border-border/50 !shadow-lg",
          }}
        />
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="min-h-[12rem]">{children}</div>
        <TalentBottomTabBar />
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!rounded-xl !border-border/50 !shadow-lg",
          }}
        />
      </div>
    );
  }

  const { data } = result;

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <TalentStatusBanner
        completionScore={data.completionScore}
        workflowStatus={data.profile.workflow_status}
        visibility={data.profile.visibility}
        previewHref={data.previewHref}
        livePageAvailable={data.livePageAvailable}
      />

      <div className="min-h-[12rem]">{children}</div>

      <TalentBottomTabBar />
      <Toaster
        position="top-center"
        toastOptions={{
          className: "!rounded-xl !border-border/50 !shadow-lg",
        }}
      />
    </div>
  );
}
