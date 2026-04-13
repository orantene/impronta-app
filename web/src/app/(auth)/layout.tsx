import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-10 font-display text-lg tracking-[0.22em] text-foreground transition-colors hover:text-primary"
        >
          IMPRONTA
        </Link>
        <div className="w-full max-w-sm rounded-lg border border-border/50 bg-card/80 p-8 shadow-none backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
