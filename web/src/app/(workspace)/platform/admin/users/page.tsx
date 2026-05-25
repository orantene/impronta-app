// Platform HQ · Users
// Every registered person on Tulala. Identity (Talent / Client / Staff /
// Super-admin) and workspace power (owner / admin / member) are surfaced
// independently — a talent can also own a Studio, and the table shows both
// signals. The drawer lists every workspace and hub the user belongs to.

import { loadPlatformUsers } from "../../platform-data";
import { UsersClient } from "./UsersClient";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { confirmed } = await searchParams;
  const users = await loadPlatformUsers();

  const talentCount = users.filter((u) => u.appRole === "talent").length;
  const clientCount = users.filter((u) => u.appRole === "client").length;
  const staffCount = users.filter(
    (u) => u.appRole === "super_admin" || u.appRole === "agency_staff" || u.appRole === "admin",
  ).length;
  const operatorCount = users.filter((u) => u.workspaceAdminCount > 0).length;
  // Only count actual humans with unconfirmed emails — unclaimed talents have
  // emailConfirmed=null (not a real "unconfirmed" state) so exclude them.
  const unconfirmedCount = users.filter(
    (u) => u.kind === "human" && u.emailConfirmed === false,
  ).length;

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontFamily: HQ_FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          Users
        </h1>
        <p
          style={{
            fontFamily: HQ_F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {users.length} total · {talentCount} talent · {clientCount} client · {staffCount} staff · {operatorCount} workspace operator{operatorCount === 1 ? "" : "s"}
          {unconfirmedCount > 0 && (
            <> · <span style={{ color: HQ.amber }}>{unconfirmedCount} email unconfirmed</span></>
          )}
        </p>
      </div>

      {/* Success banner */}
      {confirmed === "1" && (
        <div
          style={{
            background: HQ.greenSoft,
            border: `1px solid rgba(93,211,160,0.22)`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            color: HQ.green,
            fontFamily: HQ_F,
            marginBottom: 16,
          }}
        >
          Email confirmed successfully.
        </div>
      )}

      <UsersClient rows={users} />
    </>
  );
}
