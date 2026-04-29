/**
 * Synthetic section ID for the live header element.
 *
 * Both the server-rendered <PublicHeader> (when in edit mode) and the
 * client-rendered <InspectorDock> reference this. It must NOT live in
 * a module that imports server-only APIs (next/headers, server actions,
 * etc.) — Next.js follows the import graph, and a server-only dep
 * smuggled through this constant breaks the client bundle.
 */
export const SITE_HEADER_SELECTION_ID = "__site_header__";
