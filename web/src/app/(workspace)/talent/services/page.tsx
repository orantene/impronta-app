import { ServicesBootstrapSeed } from "@/components/talent/services/ServicesBootstrapSeed";
import { loadServicesBootstrap } from "@/lib/talent/services-bootstrap.server";
import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default async function PlatformTalentServicesPage() {
  // TUL-824: the list loads here, on the server, so the client mounts with it
  // instead of queueing a server action behind the shell's (a 7 to 9 s wait).
  const bundle = await loadServicesBootstrap();
  return (
    <>
      <ServicesBootstrapSeed bundle={bundle} />
      <TalentPageRouteSyncer page="services" />
    </>
  );
}
