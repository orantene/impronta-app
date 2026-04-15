import { redirect } from "next/navigation";

/** Detail view — shared implementation with `/client/requests/[id]` for now. */
export default async function ClientInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/client/requests/${id}`);
}
