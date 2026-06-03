/**
 * Plain (directive-free) type module for the link-unfurl contract.
 *
 * The type lives here — NOT in `unfurl.ts` — because that is a `"use server"`
 * module, which may only export async functions; a `export type` from one is
 * stripped by the Turbopack RSC graph and breaks client consumers that import
 * it. Both the server action and the message-thread UI import the type here.
 */

export type LinkUnfurl = {
  ok: boolean;
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};
