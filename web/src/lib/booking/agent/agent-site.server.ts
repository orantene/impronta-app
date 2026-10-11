import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import { catalogTenantForPublicHost } from "@/lib/ai/booking-assistant/catalog-tenant";
import { signTalentOfferingIntent } from "@/lib/messaging/talent-offering-intent";
import { HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { getPublicHostContext } from "@/lib/saas/scope";
import {
  loadPublicOpenTimes,
  PUBLIC_BOOKING_HOST_KINDS,
  type PublicOpenTimesHost,
} from "@/lib/scheduling/public-open-times";
import { clampPublicSlotDays, parsePublicSlotFrom } from "@/lib/scheduling/public-slots";
import { logServerError } from "@/lib/server/safe-error";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { loadTalentPublicSiteByProfileCode } from "@/lib/talent-site/server/public-load";

import { type AgentService, toAgentServices } from "./catalog";
import { agentBookingRefusal, agentHandoffUrl, agentOpenTimesView, AGENT_HANDOFF_TTL_MS } from "./handoff";
import type { AgentToolDeps, AgentToolResult } from "./mcp";

/** One talent's booking site, as an outside AI assistant reaches it. */
export type AgentSite = {
  talentProfileId: string;
  name: string;
  origin: string;
  /** Where the talent's page lives on this host: "/" on their own domain. */
  basePath: string;
  host: PublicOpenTimesHost;
  catalogTenantId: string | null;
  locale: string;
};

const PROFILE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * The talent a request is for. On the talent's own domain the proxy names
 * them; on a shared host (app, hub, agency, apex) `?talent=<profile code>`
 * does, and only a talent with a PUBLISHED site answers. null → 404.
 */
export async function resolveAgentSite(admin: SupabaseClient, request: Request): Promise<AgentSite | null> {
  const host = await getPublicHostContext();
  if (!PUBLIC_BOOKING_HOST_KINDS.has(host.kind)) return null;
  const url = new URL(request.url);

  let talentProfileId: string | null = null;
  let basePath = "/";
  if (host.kind === "talent_site") {
    talentProfileId = (await headers()).get(HOST_TALENT_PROFILE_HEADER)?.trim() || null;
  } else {
    const code = (url.searchParams.get("talent") ?? "").trim();
    if (!PROFILE_CODE_RE.test(code)) return null;
    const site = await loadTalentPublicSiteByProfileCode(code);
    if (site.kind !== "published") return null;
    talentProfileId = site.talentProfileId;
    basePath = `/t/${encodeURIComponent(site.profileCode)}`;
  }
  if (!talentProfileId) return null;

  const { data: profile, error } = await admin
    .from("talent_profiles")
    .select("id, display_name, first_name, profile_code, is_publicly_hidden, deleted_at")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("api.public.booking.agent.profile", error);
    return null;
  }
  const row = profile as {
    display_name: string | null;
    first_name: string | null;
    profile_code: string;
    is_publicly_hidden: boolean | null;
    deleted_at: string | null;
  } | null;
  if (!row || row.is_publicly_hidden || row.deleted_at) return null;

  return {
    talentProfileId,
    name: row.display_name?.trim() || row.first_name?.trim() || row.profile_code,
    origin: url.origin,
    basePath,
    host: {
      kind: host.kind,
      tenantId: host.kind === "agency" || host.kind === "hub" ? host.tenantId : null,
      talentSiteId: host.kind === "talent_site" ? talentProfileId : null,
    },
    catalogTenantId: catalogTenantForPublicHost(host.kind, host.tenantId),
    locale: await getRequestLocale(),
  };
}

export async function loadAgentServices(site: AgentSite): Promise<AgentService[]> {
  const offerings = await loadPublicOfferingsForProfile(site.talentProfileId, site.locale, site.catalogTenantId);
  return toAgentServices(offerings, site.locale);
}

const fail = (error: string, message: string): AgentToolResult => ({ ok: false, error, message });

export function agentToolDeps(admin: SupabaseClient, site: AgentSite): AgentToolDeps {
  const findService = async (id: string) => (await loadAgentServices(site)).find((s) => s.id === id) ?? null;

  const openTimes = async (offeringId: string, from: Date, days: number, now: Date) => {
    const result = await loadPublicOpenTimes(admin, {
      host: site.host,
      offeringId,
      from,
      days,
      parseDuration: (base) => base,
      now,
    });
    // A shared host would answer for any talent's offering: keep it to this one.
    if (result.ok && result.talentProfileId && result.talentProfileId !== site.talentProfileId) return null;
    return result.ok ? result : null;
  };

  return {
    talentName: site.name,

    listServices: async () => {
      const services = await loadAgentServices(site);
      return { ok: true, data: { talent: site.name, services } };
    },

    findOpenTimes: async (args) => {
      const service = await findService(args.service_id);
      if (!service) return fail("unknown_service", "No public service has that service_id. Call list_services.");
      const now = new Date();
      const result = await openTimes(
        service.id,
        parsePublicSlotFrom(args.from ?? null, now),
        clampPublicSlotDays(args.days ?? null),
        now,
      );
      if (!result) return fail("unavailable", "Open times could not be read. Try again shortly.");
      return {
        ok: true,
        data: { service_id: service.id, service: service.title, ...agentOpenTimesView(result, site.locale) },
      };
    },

    requestBooking: async (args) => {
      const service = await findService(args.service_id);
      if (!service) return fail("unknown_service", "No public service has that service_id. Call list_services.");
      const switches = await loadTalentSiteSwitches(admin, site.talentProfileId);
      const refusal = agentBookingRefusal({
        serviceBookable: service.bookable,
        agentBookingEnabled: switches.chatConfig.agentBookingEnabled,
        acceptingBookings: switches.acceptingBookings,
      });
      if (refusal === "agent_booking_off") {
        return fail(
          refusal,
          `${site.name} has not turned on booking through AI assistants. Send the person to ${site.origin}${site.basePath} instead.`,
        );
      }
      if (refusal === "not_accepting_bookings") {
        return fail(refusal, `${site.name} is not taking new bookings right now.`);
      }
      if (refusal) return fail(refusal, `${site.name} is not taking requests for this service right now.`);

      let requestedTime: string | null = null;
      if (args.starts_at) {
        const at = Date.parse(args.starts_at);
        if (!Number.isFinite(at)) return fail("invalid_time", "starts_at must be an ISO 8601 time from find_open_times.");
        const now = new Date();
        const from = new Date(Math.max(now.getTime(), at - 24 * 60 * 60 * 1000));
        const result = await openTimes(service.id, from, 2, now);
        if (!result) return fail("unavailable", "Open times could not be read. Try again shortly.");
        if (!result.slots.some((s) => Date.parse(s) === at)) {
          return fail("time_not_open", "That time is not open. Call find_open_times for current times.");
        }
        requestedTime = new Date(at).toISOString();
      }

      const token = signTalentOfferingIntent({
        profileId: site.talentProfileId,
        offeringId: service.id,
        intent: "reserve",
      });
      if (!token) return fail("unavailable", "A booking link could not be made right now.");

      return {
        ok: true,
        data: {
          confirm_url: agentHandoffUrl(site.origin, site.basePath, token),
          expires_at: new Date(Date.now() + AGENT_HANDOFF_TTL_MS).toISOString(),
          service: service.title,
          price: service.price,
          requested_time: requestedTime,
          next_step:
            `Give this link to the person. It opens ${site.name}'s chat with "${service.title}" chosen; ` +
            (requestedTime ? "they send a message with the time they want. " : "they send a message to request it. ") +
            `Nothing is booked until ${site.name} confirms.`,
        },
      };
    },
  };
}
