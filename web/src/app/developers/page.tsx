import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { developerDocsEnabled } from "@/lib/developer-docs/flag";
import { DOC_PAGES } from "@/lib/developer-docs/outline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Developer docs", robots: { index: false, follow: false } };

export default function DeveloperDocsIndex() {
  if (!developerDocsEnabled()) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Developer docs</h1>
      <ul className="mt-6 space-y-3">
        {DOC_PAGES.map((p) => (
          <li key={p.slug}>
            <Link href={`/developers/${p.slug}`} className="font-medium underline">{p.title}</Link>
            <p className="text-sm opacity-70">{p.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
