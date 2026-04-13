import { redirect } from "next/navigation";

export default function ClientDashboardIndexPage() {
  redirect("/client/overview");
}
