import { redirect } from "next/navigation";

/** @deprecated Use /client/account */
export default function ClientProfileRedirectPage() {
  redirect("/client/account");
}
