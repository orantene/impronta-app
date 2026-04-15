import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const nextPath = normalizeOptionalNextPath(next);

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          After signing up you&apos;ll choose whether you&apos;re{" "}
          <strong>Talent</strong> (join the agency roster) or a{" "}
          <strong>Client</strong> (book talent for events).
        </p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      ) : null}
      <GoogleAuthButton nextPath={nextPath}>Sign up with Google</GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <RegisterForm nextPath={nextPath} />
    </div>
  );
}
