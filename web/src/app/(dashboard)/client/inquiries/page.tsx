import { redirect } from "next/navigation";

/** @deprecated Use /client/requests */
export default function ClientInquiriesRedirectPage() {
  redirect("/client/requests");
}
