import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PlatformTalentAgenciesPage() {
  permanentRedirect("/talent/money");
}
