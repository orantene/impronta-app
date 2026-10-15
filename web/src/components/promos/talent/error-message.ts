import { ERROR_COPY_KEY, type PromoActionError } from "@/lib/promos/fail-from";
import type { PromoCopy } from "@/lib/promos/copy/talent";

/** One distinct message per failure reason, plus a short support code when the server sent one. */
export function promoErrorMessage(copy: PromoCopy, res: { error: PromoActionError; ref?: string }): string {
  const base = copy.t(ERROR_COPY_KEY[res.error]);
  return res.error === "unavailable" && res.ref ? `${base} ${copy.t("err.ref", { ref: res.ref })}` : base;
}
