import { redirect } from "next/navigation";

export default async function TalentDashboardIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string }>;
}) {
  const { revision } = await searchParams;
  if (revision) {
    redirect(
      `/talent/overview?revision=${encodeURIComponent(revision)}`,
    );
  }
  redirect("/talent/my-profile");
}
