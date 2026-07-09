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
  /** Shell drawer id to open on click, when the notification targets a
   * drawer rather than (or in addition to) a page href. Null for rows
   * with no target_drawer set. Consumers that render outside the shell
   * provider (e.g. the top-bar bell) forward this via a window event:
   * see components/admin/shell/internal/open-drawer-bridge.ts. */
  targetDrawer: string | null;
  createdAt: string;
  readAt: string | null;
};
