/**
 * Preview-only no-auth QA sign-in endpoint.
 *
 * GET /api/dev/preview-qa-signin?token=<signed>&next=/path
 *
 * Allows a QA agent (or developer) to sign in as a seeded fixture user on a
 * Vercel Preview deploy WITHOUT supplying the user's password. Production
 * deploys MUST NOT expose this path — it returns 404 when VERCEL_ENV is
 * anything other than "preview".
 *
 * Security layers (all must pass):
 *   1. VERCEL_ENV === "preview" (build-time + request-time gate)
 *   2. Signed HMAC-SHA256 token (PREVIEW_QA_SIGNING_SECRET, Preview env only)
 *   3. Email must be in QA_FIXTURE_DOMAINS allowlist
 *   4. User must exist in Supabase auth
 *   5. Every successful sign-in is written to platform_audit_log
 *
 * See: web/docs/preview-qa-signin.md for usage, threat model, and setup.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { verifyPreviewQaToken } from "@/lib/auth/preview-qa-token";

export const dynamic = "force-dynamic";

/**
 * Compile-time allowlist: only emails whose domain appears here can use this
 * endpoint. Adding a domain requires a code change — deliberate friction.
 */
const QA_FIXTURE_DOMAINS = ["impronta.test"] as const;

function isAllowlistedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return QA_FIXTURE_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

/** Normalise the `next` param — only same-origin relative paths are accepted. */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  // Reject anything that looks like an absolute URL or protocol-relative URL.
  if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) return "/";
  // Must start with /
  if (!raw.startsWith("/")) return "/";
  return raw;
}

/** Write an audit trail row. Errors are swallowed — audit must not block auth. */
async function writeAuditRow(opts: {
  email: string;
  exp: number;
  ip: string;
  userAgent: string;
}): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    if (!svc) return;

    await svc.from("platform_audit_log").insert({
      action: "preview_qa_signin",
      target_type: "profile",
      target_id: opts.email,
      severity: "info",
      ip_address: opts.ip as unknown,
      user_agent: opts.userAgent,
      metadata: {
        email: opts.email,
        token_exp: opts.exp,
        env: process.env.VERCEL_ENV ?? "unknown",
      },
    });
  } catch {
    // Audit failure must never block the response.
  }
}

export async function GET(request: NextRequest) {
  // ── Gate 1: VERCEL_ENV must be "preview" ─────────────────────────────────
  // Checked at request time; the env var is also absent from Production env
  // vars so this is doubly enforced.
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const rawToken = searchParams.get("token") ?? undefined;
  const nextPath = safeNextPath(searchParams.get("next"));

  // ── Gate 2: Token signature + expiry ─────────────────────────────────────
  const verification = await verifyPreviewQaToken(rawToken);
  if (!verification.ok) {
    return new NextResponse(`Unauthorized: ${verification.reason}`, { status: 401 });
  }

  const { email } = verification;

  // ── Gate 3: Email allowlist ───────────────────────────────────────────────
  if (!isAllowlistedEmail(email)) {
    return new NextResponse("Forbidden: email not in QA fixture allowlist", { status: 403 });
  }

  // ── Gate 4: User must exist in Supabase auth ──────────────────────────────
  const adminClient = createServiceRoleClient();
  if (!adminClient) {
    return new NextResponse("Service unavailable: admin client not configured", { status: 503 });
  }

  // Look up the user by email via admin API.
  // listUsers paginates; searching by email is the simplest correct approach.
  const { data: listData, error: listError } =
    await adminClient.auth.admin.listUsers({ perPage: 1000, page: 1 });

  if (listError) {
    return new NextResponse("Failed to verify user existence", { status: 500 });
  }

  const targetUser = listData?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!targetUser) {
    return new NextResponse("Not found: no user with that email", { status: 404 });
  }

  // ── Sign in via magic-link OTP ─────────────────────────────────────────
  // Generate a magic-link token from the admin SDK, then verify the OTP
  // hash server-side with the anon-key client so that Supabase sets the
  // session cookies on the response.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const redirectResponse = NextResponse.redirect(new URL(nextPath, request.url));

  const anonClient = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Generate a magic-link. The user is already verified to exist (Gate 4), so
  // the link generator will find the account rather than create one.
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return new NextResponse(
      `Failed to generate sign-in link: ${linkError?.message ?? "no hashed_token"}`,
      { status: 500 },
    );
  }

  const { error: otpError } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });

  if (otpError) {
    return new NextResponse(`Sign-in failed: ${otpError.message}`, { status: 500 });
  }

  // ── Gate 5: Audit log ─────────────────────────────────────────────────────
  // Derive the token expiry from the payload so the audit row carries it.
  // We re-parse here to avoid threading it through — this is the happy path only.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "";

  // Parse exp from token (already verified — safe to decode without re-checking sig).
  let tokenExp = 0;
  try {
    const dot = rawToken!.indexOf(".");
    const payload = JSON.parse(
      Buffer.from(
        rawToken!.slice(0, dot).replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf-8"),
    ) as { exp?: number };
    tokenExp = payload.exp ?? 0;
  } catch {
    /* non-fatal; exp stays 0 */
  }

  await writeAuditRow({ email, exp: tokenExp, ip, userAgent });

  return redirectResponse;
}
