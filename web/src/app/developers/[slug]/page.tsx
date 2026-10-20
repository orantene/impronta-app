import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { developerDocsEnabled } from "@/lib/developer-docs/flag";
import { DOC_ENDPOINTS, DOC_PAGES, DOC_WEBHOOKS } from "@/lib/developer-docs/outline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Developer docs", robots: { index: false, follow: false } };

export default async function DeveloperDocsPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!developerDocsEnabled()) notFound();
  const { slug } = await params;
  const page = DOC_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/developers" className="text-sm underline">Developer docs</Link>
      <h1 className="mt-2 text-2xl font-semibold">{page.title}</h1>
      {page.body.map((line) => <p key={line} className="mt-3">{line}</p>)}
      {slug === "endpoints" && DOC_ENDPOINTS.map((e) => (
        <section key={e.method + e.path} className="mt-6">
          <h2 className="font-mono text-lg">{e.method} {e.path}</h2>
          <p>{e.purpose}</p>
          <p className="text-sm">Auth: {e.auth}</p>
          <h3 className="mt-2 font-medium">Request</h3>
          <ul className="list-disc pl-5">{e.request.map((r) => <li key={r}>{r}</li>)}</ul>
          <h3 className="mt-2 font-medium">Response</h3>
          <ul className="list-disc pl-5">{e.response.map((r) => <li key={r}>{r}</li>)}</ul>
          <h3 className="mt-2 font-medium">Errors</h3>
          <ul className="list-disc pl-5">{e.errors.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      ))}
      {slug === "webhooks" && DOC_WEBHOOKS.map((w) => (
        <section key={w.path} className="mt-6">
          <h2 className="font-mono text-lg">{w.path}</h2>
          <p>{w.direction}. Auth: {w.auth}.</p>
          <p className="text-sm">{w.note}</p>
        </section>
      ))}
    </main>
  );
}
