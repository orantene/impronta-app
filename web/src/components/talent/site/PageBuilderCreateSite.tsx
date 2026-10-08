"use client";

/**
 * /talent/page-builder with no website yet (TUL-213). The route is read-only;
 * this is the explicit create step. The route renders bare (no dashboard
 * layout), so it brings its own locale provider. After a successful create the
 * card refreshes the route and the server renders the editor.
 */

import Link from "next/link";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";
import { CreateMySiteCard } from "./CreateMySiteCard";

function Body() {
  const copy = useDashboardText();
  return (
    <main
      data-testid="page-builder-create-site"
      style={{ maxWidth: 620, margin: "0 auto", padding: "56px 20px", fontFamily: FONTS.body }}
    >
      <h1 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600, color: COLORS.inkMuted }}>
        {copy.t("Create your website to use the page builder")}
      </h1>
      <CreateMySiteCard />
      <p style={{ margin: "16px 0 0", fontSize: 12.5 }}>
        <Link href="/talent/public-page" style={{ color: COLORS.inkMuted }}>
          {copy.t("Back to my presence")}
        </Link>
      </p>
    </main>
  );
}

export function PageBuilderCreateSite({ locale }: { locale: string }) {
  return (
    <DashboardLocaleProvider locale={locale}>
      <Body />
    </DashboardLocaleProvider>
  );
}
