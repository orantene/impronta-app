import { redirect } from "next/navigation";

type PageParams = Promise<{ profileCode: string }>;
type PageSearchParams = Promise<{ preview?: string }>;

/** Legacy URL — Max personal sites live at `/t/<profileCode>` on Tulala hosts. */
export default async function TalentPersonalSiteLegacyRedirect({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { profileCode } = await params;
  const { preview } = await searchParams;
  const qs = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  redirect(`/t/${encodeURIComponent(profileCode)}${qs}`);
}
