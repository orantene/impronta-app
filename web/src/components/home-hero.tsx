"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { clientLocaleHref } from "@/i18n/client-directory-href";

export function HomeHero() {
  const pathname = usePathname();
  return (
    <section className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(212,175,55,0.12),transparent)]"
      />
      <motion.div
        className="relative max-w-2xl text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="font-[family-name:var(--font-cinzel)] text-sm font-medium uppercase tracking-[0.35em] text-[var(--impronta-gold-dim)]">
          Agencia de modelos e imagen
        </p>
        <h1 className="mt-6 font-[family-name:var(--font-cinzel)] text-3xl font-normal leading-tight tracking-[0.06em] text-zinc-100 sm:text-4xl md:text-5xl">
          Talent,{" "}
          <span className="text-[var(--impronta-gold)]">presented</span> with
          intention.
        </h1>
        <p className="mx-auto mt-8 max-w-lg text-base leading-relaxed text-[var(--impronta-muted)]">
          Curated discovery for premium events — save profiles, brief the
          agency, and let the team handle every booking. No marketplace noise,
          no direct client-to-talent channel.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={clientLocaleHref(pathname, "/directory")}>
              Search talent
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
