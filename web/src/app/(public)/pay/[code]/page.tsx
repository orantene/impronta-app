import { PayByCodePage } from "./pay-page";

/**
 * `/pay/<code>` — MC15–MC20. The code is the credential.
 * Branded seller hosts (subdomain / custom / agency).
 */
export default async function Page(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string; confirm?: string }>;
}) {
  return PayByCodePage({ ...props, pathPrefix: "/pay" });
}
