import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = normalizeNextPath(searchParams.get("next"));
  const popup = searchParams.get("popup") === "1";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  if (code) {
    const cookieStore = await cookies();
    const response = popup
      ? createPopupResponse(origin, { success: false, error: "Authentication failed." })
      : NextResponse.redirect(`${origin}/login?error=auth`);
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ensuredProfile = user
        ? await loadAccessProfile(supabase, user.id)
        : null;
      const destination = resolvePostAuthDestination(ensuredProfile, next);
      const successResponse = popup
        ? createPopupResponse(origin, { success: true, destination })
        : NextResponse.redirect(`${origin}${destination}`);
      response.cookies.getAll().forEach((cookie) => {
        successResponse.cookies.set(cookie);
      });
      return successResponse;
    }
  }

  if (popup) {
    return createPopupResponse(origin, {
      success: false,
      error: "Authentication failed.",
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

function createPopupResponse(
  origin: string,
  payload: Omit<AuthPopupMessage, "type">,
) {
  const message: AuthPopupMessage = {
    type: AUTH_POPUP_MESSAGE_TYPE,
    ...payload,
  };
  const serializedMessage = JSON.stringify(message);
  const serializedOrigin = JSON.stringify(origin);

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <body>
    <script>
      const message = ${serializedMessage};
      const targetOrigin = ${serializedOrigin};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, targetOrigin);
      }
      window.close();
      document.body.textContent = message.success
        ? "Authentication complete. You can close this window."
        : (message.error || "Authentication failed. You can close this window.");
    </script>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
