import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Account setup",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="site-theme-platform flex min-h-full flex-1 flex-col bg-background">{children}</div>;
}
