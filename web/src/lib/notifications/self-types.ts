/**
 * Plain (directive-free) type module for the self-service notification contract.
 *
 * The type lives here — NOT in the `"use server"` wrappers — because a
 * `"use server"` module may only export async functions; re-exporting a type
 * from one is stripped by the RSC/Turbopack graph and breaks consumers that
 * import it. Both server wrappers and client components import the type here.
 */

export type MyNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};
