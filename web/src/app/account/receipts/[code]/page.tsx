import { ACCOUNT_AREA_METADATA, renderClientAccountPage } from "@/lib/client-account/render-area";

export const dynamic = "force-dynamic";
export const metadata = ACCOUNT_AREA_METADATA;

/** `/account/receipts/<code>` on a talent site (TUL-62). Flag off or any other host: 404. */
export default async function AccountAreaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return renderClientAccountPage({ kind: "receipt", code });
}
