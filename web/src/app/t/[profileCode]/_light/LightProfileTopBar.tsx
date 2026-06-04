/**
 * LightProfileTopBar — a minimal, clean header for the public talent profile.
 *
 * Deliberately NOT the full platform PublicHeader (search / account / nav): a
 * shared talent link should feel like a focused "link-in-bio", so this is just
 * a slim wordmark bar. Footer (PublicCmsFooterNav) still carries site nav.
 */

import Link from "next/link";

export function LightProfileTopBar({ brand }: { brand: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#ECECEC] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-[family-name:var(--font-cinzel)] text-[13px] font-medium uppercase tracking-[0.32em] text-[#1A1A1A] transition-opacity hover:opacity-70"
        >
          {brand}
        </Link>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[#B7AE9F]">
          Talent
        </span>
      </div>
    </header>
  );
}
