import type { Metadata } from "next";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadOpenVisitByToken } from "@/lib/visits/qr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your table",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

export default async function GuestVisitPage({ params }: Params) {
  const { token } = await params;
  const host = await getPublicHostContext();
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);

  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return <VisitNotice title={tr("dashboard.visit.inactive")} body={tr("dashboard.visit.askStaff")} />;
  }

  const loaded = await loadOpenVisitByToken(admin, { tenantId: host.tenantId, publicToken: token });
  if (!loaded.ok) {
    const title =
      loaded.reason === "ended" ? tr("dashboard.visit.ended") : tr("dashboard.visit.inactive");
    return <VisitNotice title={title} body={tr("dashboard.visit.askStaff")} />;
  }

  return (
    <main
      style={{
        margin: 0,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        font: "16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif",
        color: "#1a1e22",
        background: "#f5f7f4",
      }}
    >
      <section style={{ maxWidth: "24rem", padding: "1.5rem", width: "100%" }}>
        <h1 style={{ fontSize: "1.25rem", margin: "0 0 .75rem" }}>{tr("dashboard.visit.title")}</h1>
        {loaded.lines.length === 0 ? (
          <p style={{ color: "#4e5a63" }}>{tr("dashboard.visit.empty")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {loaded.lines.map((line) => (
              <li key={line.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                <span>
                  {line.label} × {line.units}
                </span>
                <span>{line.totalCents}</span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: 16 }}>
          {tr("dashboard.visit.total")}: {loaded.totalCents} {loaded.currency}
        </p>
        <p style={{ fontSize: 13, color: "#4e5a63" }}>{tr("dashboard.visit.identityNote")}</p>
      </section>
    </main>
  );
}

function VisitNotice({ title, body }: { title: string; body: string }) {
  return (
    <main
      style={{
        margin: 0,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        font: "16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif",
        color: "#1a1e22",
        background: "#f5f7f4",
      }}
    >
      <section style={{ maxWidth: "24rem", padding: "1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", margin: "0 0 .5rem" }}>{title}</h1>
        <p style={{ margin: 0, color: "#4e5a63" }}>{body}</p>
      </section>
    </main>
  );
}
