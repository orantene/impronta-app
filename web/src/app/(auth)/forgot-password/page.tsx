import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; email?: string }>;
}) {
  const { notice, email } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="text-m text-muted-foreground">
          We will email you a link to choose a new password. If you usually sign in with Google, you
          can keep using that — or set a password here to also sign in with email.
        </p>
      </div>
      {notice === "expired" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-m text-foreground">
          That reset link is no longer valid. Enter your email below to get a new one.
        </p>
      ) : null}
      <ForgotPasswordForm defaultEmail={email ? decodeURIComponent(email) : undefined} />
    </div>
  );
}
