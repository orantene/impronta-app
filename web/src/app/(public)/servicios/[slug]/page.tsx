import type { Metadata } from "next";

import {
  BusinessServicePage,
  businessServiceMetadata,
  type BusinessServiceParams,
} from "@/app/(public)/_services/business-service-route";

/** TUL-1272 #5: one business service page in Spanish (`/servicios/<slug>`). Logic in _services/business-service-route.tsx. */
export const dynamic = "force-dynamic";

export function generateMetadata(props: BusinessServiceParams): Promise<Metadata> {
  return businessServiceMetadata("servicios", props);
}

export default function Page(props: BusinessServiceParams) {
  return <BusinessServicePage segment="servicios" params={props.params} />;
}
