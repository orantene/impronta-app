"use client";

import { AdminUserEditSheet } from "@/app/(dashboard)/admin/users/admin-user-edit-sheet";

export function AdminTalentAccountPage({
  talentProfileId,
  userId,
  profileCode,
}: {
  talentProfileId: string;
  userId: string;
  profileCode: string;
}) {
  return (
    <AdminUserEditSheet
      open
      presentation="inline"
      onOpenChange={() => {}}
      userId={userId}
      talentProfileId={talentProfileId}
      profileCode={profileCode}
    />
  );
}
