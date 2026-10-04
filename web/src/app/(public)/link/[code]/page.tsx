import { PayByCodePage } from "../../pay/[code]/pay-page";

/**
 * `/link/<code>` — platform pay-host fallback (`pay.tulala.digital`).
 * Same payment engine as `/pay/<code>`; path is presentation only.
 */
export default async function Page(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string; confirm?: string }>;
}) {
  return PayByCodePage({ ...props, pathPrefix: "/link" });
}
