import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "./update-password-form";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

export default async function UpdatePasswordPage() {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    redirect("/login?error=config");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/forgot-password?notice=expired");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Set new password</h1>
        <p className="text-m text-muted-foreground">
          Choose a strong password. After saving, you will be signed in and taken to your dashboard.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
