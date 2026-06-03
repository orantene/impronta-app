/**
 * Plain (directive-free) type module for the global-search contract.
 *
 * The type lives here — NOT in `global-search.ts` — because that is a
 * `"use server"` module, which may only export async functions; a `export type`
 * from one is stripped by the Turbopack RSC graph and breaks client consumers
 * that import it. Both the server action and the search UIs import the type here.
 */

export type SearchResult = {
  kind: "inquiry" | "booking" | "message" | "talent";
  id: string;
  title: string;
  snippet: string;
  href: string;
};
