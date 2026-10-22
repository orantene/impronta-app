import type { ReactNode } from "react";

import { getClientMessagesPayload } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

import { PayClientMessages } from "./PayClientMessages";

/** TUL-1935: same locale rule as pay-page.tsx (`en`, else `es`). */
export default async function PayCodeLayout({ children }: { children: ReactNode }) {
  const uiLocale = (await getRequestLocale()) === "en" ? "en" : "es";
  const pub = getClientMessagesPayload(uiLocale)[uiLocale]?.public as Record<string, unknown> | undefined;
  return (
    <>
      <PayClientMessages code={uiLocale} thread={pub?.thread} />
      {children}
    </>
  );
}
