"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { BookPageClient as BookPageClientType } from "@/app/(public)/book/BookPageClient";

/**
 * TUL-1221: client boundary + lazy chunk for the real booking flow embedded in
 * builder-node live-booking bands.
 *
 * `render.tsx` is reachable from every admin route (previews, canvas). A server
 * module that imports a "use client" module (even via `await import()`) pulls
 * that module's client chunks into the entry's client reference manifest, so
 * every admin route listed BookPageClient and its ~2.8 MB of dependencies.
 * Importing THIS thin boundary instead keeps the manifest to this file, and the
 * booking client loads as an async chunk only when a live-booking band renders
 * (SSR is preserved; Next preloads the chunk during server render).
 */
const BookPageClient = dynamic(
  () => import("@/app/(public)/book/BookPageClient").then((m) => m.BookPageClient),
  { ssr: true },
);

export function LiveBookingClientIsland(props: ComponentProps<typeof BookPageClientType>) {
  return <BookPageClient {...props} />;
}
