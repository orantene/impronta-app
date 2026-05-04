import { redirect } from "next/navigation";

export default function PlatformAdminRoot() {
  redirect("/platform/admin/today");
}
