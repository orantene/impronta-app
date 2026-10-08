import { ACCOUNT_AREA_METADATA, renderClientAccountPage } from "@/lib/client-account/render-area";

export const dynamic = "force-dynamic";
export const metadata = ACCOUNT_AREA_METADATA;

/** `/account/messages/<thread>` on a talent site (TUL-62). Flag off or any other host: 404. */
export default async function AccountAreaPage({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = await params;
  return renderClientAccountPage({ kind: "thread", id: thread });
}
