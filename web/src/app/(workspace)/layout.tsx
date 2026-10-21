// Pass-through layout for every signed-in workspace surface (workspace admin, talent
// dashboard, client portal, platform admin). Its only job is TUL-1773: add the admin
// message subtrees to the browser translator store. The root layout inlines the public
// subtrees only, so signed-out visitors on public talent pages never download them.

import { headers } from "next/headers";

import { getClientMessagesPayload } from "@/i18n/messages";
import {
  getRequestLocale,
  ORIGINAL_PATHNAME_HEADER,
  ORIGINAL_SEARCH_HEADER,
  resolveDocumentLocale,
} from "@/i18n/request-locale";

import { AdminClientMessages } from "./admin-client-messages";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // Same locale derivation as the root layout, so the admin subtrees match the public ones.
  const requestLocale = await getRequestLocale();
  const reqHeaders = await headers();
  const locale = resolveDocumentLocale(
    requestLocale,
    reqHeaders.get(ORIGINAL_PATHNAME_HEADER),
    reqHeaders.get(ORIGINAL_SEARCH_HEADER),
    { acceptLanguage: reqHeaders.get("accept-language"), country: reqHeaders.get("x-vercel-ip-country") },
  );
  return (
    <>
      <AdminClientMessages payload={getClientMessagesPayload(locale, "admin")} />
      {children}
    </>
  );
}
