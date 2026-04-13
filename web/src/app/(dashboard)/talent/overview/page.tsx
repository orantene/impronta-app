import { redirect } from "next/navigation";

/**
 * Overview has been merged into the My Profile page.
 * Redirect so bookmarks and old links still work.
 */
export default function TalentOverviewPage() {
  redirect("/talent/my-profile");
}
