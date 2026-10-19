/**
 * TUL-1017: orchestration for the automatic Turnstile widget, with every
 * dependency injected (env, fetch, captcha store, logger) so it is testable
 * without a database or Cloudflare. `server.ts` wires the real ones.
 *
 * Fail-safe: a missing flag or env makes ZERO Cloudflare calls; any API error
 * or timeout is logged once (names/status only) and leaves the workspace on
 * captcha "none", which is exactly today's behavior.
 */

import { createTurnstileWidgetClient, type FetchLike } from "./cloudflare-client";
import {
  decideCreateOrReuse,
  decideOnDomainActive,
  decideOnDomainDetach,
  isAutoWidgetFlagOn,
  MAX_WIDGET_CREATIONS_PER_RUN,
  readAutoWidgetEnv,
  type CaptchaConfigView,
  type ListedWidget,
} from "./decision";

export type ManagedCaptchaStore = {
  /** The workspace's captcha integration config_json (null when no row). */
  getConfig(tenantId: string): Promise<CaptchaConfigView | null>;
  hasSecret(tenantId: string): Promise<boolean>;
  /** Write site key + secret marked managed_by tulala-auto. False on failure. */
  saveManaged(
    tenantId: string,
    input: { siteKey: string; secret: string; domain: string; widgetName: string },
  ): Promise<boolean>;
  /** Remove the managed keys (config + secret). False on failure. */
  clearManaged(tenantId: string): Promise<boolean>;
};

export type AutoWidgetDeps = {
  env: Record<string, string | undefined>;
  fetch: FetchLike;
  store: ManagedCaptchaStore;
  log: (context: string, detail: Record<string, unknown>) => void;
};

export type ActivatedDomain = { tenantId: string; hostname: string };

export type AutoWidgetRunReport = {
  ran: boolean;
  created: number;
  skipped: number;
  failed: number;
  results: Array<{ hostname: string; outcome: string }>;
};

const LOG_CONTEXT = "captcha.turnstile-auto-widget";

export async function provisionAutoTurnstileWidgets(
  domains: ActivatedDomain[],
  deps: AutoWidgetDeps,
  opts: { cap?: number } = {},
): Promise<AutoWidgetRunReport> {
  const report: AutoWidgetRunReport = { ran: false, created: 0, skipped: 0, failed: 0, results: [] };
  if (!isAutoWidgetFlagOn(deps.env) || domains.length === 0) return report;
  const env = readAutoWidgetEnv(deps.env);
  if (!env) {
    deps.log(LOG_CONTEXT, { event: "missing_env", domains: domains.length });
    return report;
  }
  report.ran = true;

  const client = createTurnstileWidgetClient({ accountId: env.accountId, apiToken: env.apiToken, fetch: deps.fetch });
  const cap = opts.cap ?? MAX_WIDGET_CREATIONS_PER_RUN;
  let widgets: ListedWidget[] | null = null;
  const skip = (hostname: string, outcome: string) => {
    report.skipped += 1;
    report.results.push({ hostname, outcome });
  };
  const fail = (hostname: string, outcome: string, status: number | null) => {
    report.failed += 1;
    report.results.push({ hostname, outcome });
    deps.log(LOG_CONTEXT, { event: outcome, hostname, status });
  };

  for (const d of domains) {
    try {
      const config = await deps.store.getConfig(d.tenantId);
      const pre = decideOnDomainActive({ hostname: d.hostname, config, env: deps.env });
      if (pre.action === "skip") {
        skip(d.hostname, pre.reason);
        continue;
      }

      if (!widgets) {
        const listed = await client.listWidgets();
        if (!listed.ok) {
          // One failed list fails the whole run safe; nothing else is attempted.
          fail(d.hostname, `list_${listed.code}`, listed.status);
          break;
        }
        widgets = listed.widgets;
      }

      const storedSiteKey = typeof config?.site_key === "string" ? config.site_key : null;
      const next = decideCreateOrReuse({
        domain: pre.domain,
        widgets,
        storedSiteKey,
        storedSecretPresent: storedSiteKey ? await deps.store.hasSecret(d.tenantId) : false,
        createdSoFar: report.created,
        cap,
      });
      if (next.action !== "create") {
        if (next.action === "skip_reuse_no_secret") {
          deps.log(LOG_CONTEXT, { event: next.action, hostname: d.hostname });
        }
        skip(d.hostname, next.action);
        continue;
      }

      const created = await client.createWidget({ name: next.name, domains: next.domains });
      if (!created.ok) {
        fail(d.hostname, `create_${created.code}`, created.status);
        continue;
      }
      const saved = await deps.store.saveManaged(d.tenantId, {
        siteKey: created.widget.sitekey,
        secret: created.widget.secret,
        domain: pre.domain,
        widgetName: next.name,
      });
      if (!saved) {
        // Do not leave an orphan widget whose secret nobody holds.
        await client.deleteWidget(created.widget.sitekey);
        fail(d.hostname, "store_failed", null);
        continue;
      }
      widgets.push({ sitekey: created.widget.sitekey, name: next.name });
      report.created += 1;
      report.results.push({ hostname: d.hostname, outcome: "created" });
    } catch (error) {
      report.failed += 1;
      report.results.push({ hostname: d.hostname, outcome: "unexpected" });
      deps.log(LOG_CONTEXT, {
        event: "unexpected_error",
        hostname: d.hostname,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return report;
}

export type ReleaseOutcome =
  | "flag_off"
  | "missing_env"
  | "deleted"
  | `skip_${string}`
  | "delete_failed"
  | "clear_failed"
  | "unexpected";

/**
 * Domain detach: delete the managed widget and its stored keys, only when the
 * pure decision says this feature owns them. Never throws.
 */
export async function releaseAutoTurnstileWidget(
  input: ActivatedDomain,
  deps: AutoWidgetDeps,
): Promise<ReleaseOutcome> {
  if (!isAutoWidgetFlagOn(deps.env)) return "flag_off";
  const env = readAutoWidgetEnv(deps.env);
  if (!env) {
    deps.log(LOG_CONTEXT, { event: "missing_env_on_detach", hostname: input.hostname });
    return "missing_env";
  }
  try {
    const config = await deps.store.getConfig(input.tenantId);
    const decision = decideOnDomainDetach({ hostname: input.hostname, config });
    if (decision.action === "skip") return `skip_${decision.reason}`;
    const client = createTurnstileWidgetClient({ accountId: env.accountId, apiToken: env.apiToken, fetch: deps.fetch });
    const del = await client.deleteWidget(decision.sitekey);
    // 404: the widget is already gone; the stored keys are dead, clear them.
    if (!del.ok && del.status !== 404) {
      deps.log(LOG_CONTEXT, { event: `delete_${del.code}`, hostname: input.hostname, status: del.status });
      return "delete_failed";
    }
    const cleared = await deps.store.clearManaged(input.tenantId);
    if (!cleared) {
      deps.log(LOG_CONTEXT, { event: "clear_failed", hostname: input.hostname });
      return "clear_failed";
    }
    return "deleted";
  } catch (error) {
    deps.log(LOG_CONTEXT, { event: "unexpected_error_on_detach", name: error instanceof Error ? error.name : "unknown" });
    return "unexpected";
  }
}
