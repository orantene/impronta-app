import "server-only";

import { acceptCurrentPolicy, requestFingerprint } from "./policy-versions";

/**
 * Legal 2.2: record that a new account confirmed 18+ and agreed to the
 * platform Terms and Privacy Policy. Best effort, never throws.
 */
export async function recordSignupAcceptance(userId: string): Promise<void> {
  try {
    const fp = await requestFingerprint();
    for (const kind of ["terms", "privacy"] as const) {
      await acceptCurrentPolicy(kind, { scope: "platform" }, {
        context: "signup",
        contextId: userId,
        actorUserId: userId,
        ageConfirmed: true,
        ip: fp.ip,
        userAgent: fp.userAgent,
      });
    }
  } catch {
    // acceptCurrentPolicy already logs; nothing may escape into signup.
  }
}
