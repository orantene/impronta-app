"use server";

/** TUL-1395: dismiss remembers per user, in a cookie named for the user. */

import { cookies } from "next/headers";

import { dismissCookieName } from "@/lib/changelog/whats-new";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getCachedActorSession } from "@/lib/server/request-cache";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export async function dismissWhatsNewAction(formData: FormData): Promise<void> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return;
  const session = await getCachedActorSession();
  if (!session.user) return;
  const upTo = Number(formData.get("upTo"));
  if (!Number.isFinite(upTo) || upTo <= 0) return;
  const jar = await cookies();
  jar.set(dismissCookieName(session.user.id), String(Math.floor(upTo)), {
    path: "/",
    maxAge: ONE_YEAR_S,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
