"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function HomePublic() {
  return (
    <section className="relative w-full px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_45%_at_50%_-15%,rgba(201,162,39,0.11),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-3xl text-center">
        <motion.p
          className="font-display text-sm font-medium uppercase tracking-[0.32em] text-primary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          Models & Talent
        </motion.p>
        <motion.h1
          className="mt-8 text-balance font-display text-4xl font-normal leading-[1.12] tracking-[0.06em] text-foreground sm:text-5xl md:text-6xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          Talent,{" "}
          <span className="text-primary">presented</span>
          <br className="hidden sm:block" />
          <span className="sm:ml-1">with intention.</span>
        </motion.h1>
        <motion.p
          className="mx-auto mt-8 max-w-xl text-pretty text-muted-foreground sm:text-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          Structured discovery and agency-managed inquiries — editorial calm,
          minimal surface, no noise.
        </motion.p>

        <motion.div
          className="mx-auto mt-12 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        >
          <Input
            type="search"
            placeholder="Describe your event or campaign…"
            className="h-12 border-border/50 bg-card/30 text-left sm:flex-1"
            aria-label="AI search placeholder"
            readOnly
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="min-w-[9rem]">
              <Link href="/directory">Search</Link>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="min-w-[9rem] lg:hidden"
                >
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Mobile filter drawer placeholder — faceted taxonomy will
                    connect here.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-8 space-y-4 text-m text-muted-foreground">
                  <p>Sheet + Input primitives are themed for the directory UX.</p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/register">Create an account</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
