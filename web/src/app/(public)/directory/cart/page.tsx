import { redirect } from "next/navigation";

function firstParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/**
 * Legacy URL: inquiries now open in the directory sheet.
 * Preserves success deep-links from email by forwarding query params.
 */
export default async function InquiryCartRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const submitted = firstParam(sp.submitted);
  const activation = firstParam(sp.activation);
  const email = firstParam(sp.email);

  if (submitted === "1" || submitted === "true") {
    const q = new URLSearchParams();
    q.set("inquiry", "submitted");
    if (email) q.set("email", email);
    if (activation) q.set("activation", activation);
    redirect(`/directory?${q.toString()}`);
  }

  redirect("/directory");
}
