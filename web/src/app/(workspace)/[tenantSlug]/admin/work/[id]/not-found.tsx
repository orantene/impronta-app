import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

import { WorkNotFoundCard } from "./work-not-found-card";

export default async function WorkDetailNotFound() {
  const t = createTranslator(await getRequestLocale());
  // not-found boundaries get no params; "." resolves to the parent /<slug>/admin/work/.
  return <WorkNotFoundCard t={t} backHref="." />;
}
