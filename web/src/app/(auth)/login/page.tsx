import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string }>;
}) {
  const { error, next, email } = await searchParams;
  const nextPath = normalizeOptionalNextPath(next);

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Log in</h1>
        <p className="text-m text-muted-foreground">
          Google or email — staff roles are never chosen here. With Google, a password is optional
          (add one under Account after signing in).
        </p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-m text-destructive">
          {decodeURIComponent(error)}
        </p>
      ) : null}
      <GoogleAuthButton nextPath={nextPath}>Continue with Google</GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <LoginForm nextPath={nextPath} defaultEmail={email ? decodeURIComponent(email) : undefined} />
    </div>
  );
}
