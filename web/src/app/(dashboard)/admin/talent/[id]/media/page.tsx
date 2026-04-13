import { notFound } from "next/navigation";
import { AdminTalentMediaManager } from "@/app/(dashboard)/admin/admin-talent-media-manager";
import { loadAdminTalentMedia } from "@/lib/admin-talent-media-data";

export default async function AdminTalentMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadAdminTalentMedia(id);
  if (!result.ok) notFound();

  return (
    <AdminTalentMediaManager
      talentProfileId={id}
      profileCode={result.profileCode}
      media={result.media}
      embedded
    />
  );
}
