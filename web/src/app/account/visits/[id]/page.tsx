import { ACCOUNT_AREA_METADATA, renderClientAccountPage } from "@/lib/client-account/render-area";

export const dynamic = "force-dynamic";
export const metadata = ACCOUNT_AREA_METADATA;

/** `/account/visits/<id>` on a talent site (TUL-62). Flag off or any other host: 404. */
export default async function AccountAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderClientAccountPage({ kind: "visit", id });
}
