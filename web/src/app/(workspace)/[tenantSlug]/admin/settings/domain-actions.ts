"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDeniedError, requireCapability } from "@/lib/access";
import {
  builderPlanAllows,
  loadBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import { customDomainLockedCopy } from "@/lib/saas/workspace-public-url";
import {
  ensureCustomDomainOnVercelProject,
  loadCustomDomainVerificationRecord,
  removeCustomDomainFromVercelProject,
  syncCustomDomainProvisioning,
  verifyCustomDomainRecord,
} from "@/lib/saas/custom-domain-actions";
import { customDomainCanBecomePrimary } from "@/lib/saas/custom-domain-routing";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeCustomDomainHostname,
  pickFallbackSubdomainHostname,
} from "./domain-utils";
type DomainReturnTo = "settings" | "site";

function domainPath(
  tenantSlug: string,
  returnTo: DomainReturnTo,
  messageKey: "dmsg" | "derr",
  message: string,
): string {
  const params = new URLSearchParams({ [messageKey]: message });
  if (returnTo === "site") {
    return `/${tenantSlug}/admin/site?${params.toString()}`;
  }
  params.set("section", "domain");
  return `/${tenantSlug}/admin/settings?${params.toString()}`;
}

function redirectWithDomainError(
  tenantSlug: string,
  message: string,
  returnTo: DomainReturnTo = "settings",
): never {
  redirect(domainPath(tenantSlug, returnTo, "derr", message));
}

function redirectWithDomainMessage(
  tenantSlug: string,
  message: string,
  returnTo: DomainReturnTo = "settings",
): never {
  redirect(domainPath(tenantSlug, returnTo, "dmsg", message));
}

function readTextField(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function readReturnTo(formData: FormData): DomainReturnTo {
  return formData.get("returnTo") === "site" ? "site" : "settings";
}

async function loadManagedDomainContext(tenantSlug: string, returnTo: DomainReturnTo) {
  if (!tenantSlug) {
    redirect("/login");
  }

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    redirectWithDomainError(tenantSlug, "Workspace access could not be confirmed.", returnTo);
  }

  try {
    await requireCapability("manage_agency_domains", scope.tenantId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      redirectWithDomainError(
        tenantSlug,
        "Only the workspace owner can manage custom domains.",
        returnTo,
      );
    }
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirectWithDomainError(
      tenantSlug,
      "Domain settings are unavailable until Supabase is configured.",
      returnTo,
    );
  }

  return { scope, supabase };
}

export async function connectCustomDomainAction(formData: FormData): Promise<void> {
  const tenantSlug = readTextField(formData, "tenantSlug");
  const rawHostname = readTextField(formData, "hostname");
  const returnTo = readReturnTo(formData);

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    redirectWithDomainError(tenantSlug, normalized.message, returnTo);
  }

  const { scope, supabase } = await loadManagedDomainContext(tenantSlug, returnTo);

  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("slug")
    .eq("id", scope.tenantId)
    .maybeSingle();

  if (agencyError || !agency?.slug) {
    logServerError("workspace.settings.connectCustomDomain.agency", agencyError ?? "missing agency");
    redirectWithDomainError(tenantSlug, "Workspace details could not be loaded.", returnTo);
  }

  const workspacePlan = await loadBuilderWorkspacePlan(supabase, scope.tenantId, {
    onError: (message) =>
      logServerError(
        "workspace.settings.connectCustomDomain.plan",
        new Error(message),
      ),
  });
  if (!builderPlanAllows(workspacePlan, "builder.domain.custom")) {
    redirectWithDomainError(
      tenantSlug,
      customDomainLockedCopy(workspacePlan),
      returnTo,
    );
  }

  const hostname = normalized.hostname;
  const { data: existing, error: existingError } = await loadCustomDomainVerificationRecord(
    supabase,
    scope.tenantId,
    hostname,
  );

  if (existingError) {
    logServerError("workspace.settings.connectCustomDomain.lookup", existingError);
    redirectWithDomainError(tenantSlug, "Existing domain records could not be checked.", returnTo);
  }

  if (existing && ["active", "verified", "ssl_provisioned"].includes(existing.status)) {
    redirectWithDomainMessage(tenantSlug, `${hostname} is already connected.`, returnTo);
  }

  const verificationToken = `impronta-verify-${randomBytes(12).toString("hex")}`;

  if (existing) {
    const { error } = await supabase
      .from("agency_domains")
      .update({
        tenant_slug: agency.slug,
        status: "dns_verification_sent",
        verification_token: verificationToken,
        verified_at: null,
        failure_reason: null,
      })
      .eq("id", existing.id);

    if (error) {
      logServerError("workspace.settings.connectCustomDomain.refresh", error);
      redirectWithDomainError(
        tenantSlug,
        "Verification could not be restarted for that domain.",
        returnTo,
      );
    }
  } else {
    const { error } = await supabase
      .from("agency_domains")
      .insert({
        tenant_id: scope.tenantId,
        tenant_slug: agency.slug,
        hostname,
        kind: "custom",
        is_primary: false,
        status: "dns_verification_sent",
        verification_token: verificationToken,
      });

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        redirectWithDomainError(
          tenantSlug,
          "That domain is already connected somewhere else.",
          returnTo,
        );
      }
      logServerError("workspace.settings.connectCustomDomain.insert", error);
      redirectWithDomainError(tenantSlug, "That domain could not be saved.", returnTo);
    }
  }

  const vercelSync = await ensureCustomDomainOnVercelProject(hostname);
  if (vercelSync.attempted && !vercelSync.attached) {
    logServerError("workspace.settings.connectCustomDomain.vercelAttach", {
      hostname,
      code: vercelSync.errorCode,
      message: vercelSync.errorMessage,
    });
  }

  const vercelProvisioningHint =
    !vercelSync.attempted && vercelSync.skippedReason
      ? " Vercel project provisioning is not configured yet; finish DNS and run the verification sweep after env setup."
      : vercelSync.attempted && !vercelSync.attached
        ? " DNS token is ready, but Vercel project provisioning needs attention."
        : "";

  scheduleWorkspaceAudit({
    tenantId: scope.tenantId,
    category: "domain",
    action: "domain.added",
    summary: `Connected custom domain ${hostname} and started DNS verification`,
    targetType: "domain",
    targetLabel: hostname,
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  revalidatePath(`/${tenantSlug}/admin/site`);
  redirectWithDomainMessage(
    tenantSlug,
    `DNS instructions are ready for ${hostname}. Add the TXT record to verify it.${vercelProvisioningHint}`,
    returnTo,
  );
}

export async function verifyCustomDomainNowAction(formData: FormData): Promise<void> {
  const tenantSlug = readTextField(formData, "tenantSlug");
  const rawHostname = readTextField(formData, "hostname");
  const returnTo = readReturnTo(formData);

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    redirectWithDomainError(tenantSlug, normalized.message, returnTo);
  }

  const { scope, supabase } = await loadManagedDomainContext(tenantSlug, returnTo);
  const hostname = normalized.hostname;

  const { data: domain, error } = await loadCustomDomainVerificationRecord(
    supabase,
    scope.tenantId,
    hostname,
  );

  if (error) {
    logServerError("workspace.settings.verifyCustomDomain.lookup", error);
    redirectWithDomainError(tenantSlug, "The saved domain record could not be loaded.", returnTo);
  }
  if (!domain) {
    redirectWithDomainError(
      tenantSlug,
      "That custom domain is not attached to this workspace.",
      returnTo,
    );
  }
  if (["verified", "ssl_provisioned", "active"].includes(domain.status)) {
    redirectWithDomainMessage(tenantSlug, `${hostname} is already verified.`, returnTo);
  }
  if (!domain.verificationToken) {
    redirectWithDomainError(tenantSlug, "No verification token is saved for that domain.", returnTo);
  }

  try {
    const transition = await verifyCustomDomainRecord(supabase, domain);
    revalidatePath(`/${tenantSlug}/admin/settings`);
    revalidatePath(`/${tenantSlug}/admin/site`);
    if (transition.status === "verified") {
      scheduleWorkspaceAudit({
        tenantId: scope.tenantId,
        category: "domain",
        action: "domain.verified",
        summary: `Custom domain ${hostname} passed DNS verification`,
        targetType: "domain",
        targetLabel: hostname,
      });
      redirectWithDomainMessage(tenantSlug, `${hostname} is now verified.`, returnTo);
    }
    if (transition.status === "failed") {
      redirectWithDomainError(
        tenantSlug,
        `TXT record for ${hostname} still has not been found. You can add it now and check again, or reconnect the domain for a fresh token.`,
        returnTo,
      );
    }
    redirectWithDomainError(
      tenantSlug,
      `TXT record not found for ${hostname} yet. DNS changes may still be propagating.`,
      returnTo,
    );
  } catch (updateError) {
    logServerError("workspace.settings.verifyCustomDomain.update", updateError);
    redirectWithDomainError(tenantSlug, "The domain could not be re-checked right now.", returnTo);
  }
}

export async function switchPrimaryDomainAction(formData: FormData): Promise<void> {
  const tenantSlug = readTextField(formData, "tenantSlug");
  const rawHostname = readTextField(formData, "hostname");
  const returnTo = readReturnTo(formData);

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    redirectWithDomainError(tenantSlug, normalized.message, returnTo);
  }

  const { scope, supabase } = await loadManagedDomainContext(tenantSlug, returnTo);
  const hostname = normalized.hostname;

  const { data: domain, error } = await supabase
    .from("agency_domains")
    .select("hostname, kind, status, is_primary")
    .eq("tenant_id", scope.tenantId)
    .eq("hostname", hostname)
    .maybeSingle();

  if (error) {
    logServerError("workspace.settings.switchPrimaryDomain.lookup", error);
    redirectWithDomainError(tenantSlug, "The saved domain record could not be loaded.", returnTo);
  }
  if (!domain) {
    redirectWithDomainError(tenantSlug, "That domain is not attached to this workspace.", returnTo);
  }
  if (domain.is_primary) {
    redirectWithDomainMessage(tenantSlug, `${hostname} is already the primary public URL.`, returnTo);
  }
  if (domain.kind === "custom" && !customDomainCanBecomePrimary(domain.status ?? null)) {
    redirectWithDomainError(
      tenantSlug,
      `${hostname} must finish routing and SSL checks before it can become the primary public URL.`,
      returnTo,
    );
  }

  const { error: switchError } = await supabase.rpc("set_primary_agency_domain", {
    p_tenant_id: scope.tenantId,
    p_hostname: hostname,
  });

  if (switchError) {
    logServerError("workspace.settings.switchPrimaryDomain.update", switchError);
    redirectWithDomainError(tenantSlug, "The primary public URL could not be updated.", returnTo);
  }

  scheduleWorkspaceAudit({
    tenantId: scope.tenantId,
    category: "domain",
    action: "domain.primary_changed",
    summary: `Set ${hostname} as the primary public URL`,
    targetType: "domain",
    targetLabel: hostname,
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  revalidatePath(`/${tenantSlug}/admin/site`);
  redirectWithDomainMessage(
    tenantSlug,
    domain.kind === "custom"
      ? `${hostname} is now the primary public URL.`
      : `${hostname} is now the Tulala fallback primary URL.`,
    returnTo,
  );
}

export async function removeCustomDomainAction(formData: FormData): Promise<void> {
  const tenantSlug = readTextField(formData, "tenantSlug");
  const rawHostname = readTextField(formData, "hostname");
  const returnTo = readReturnTo(formData);

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    redirectWithDomainError(tenantSlug, normalized.message, returnTo);
  }

  const { scope, supabase } = await loadManagedDomainContext(tenantSlug, returnTo);
  const hostname = normalized.hostname;

  const { data: domains, error } = await supabase
    .from("agency_domains")
    .select("id, hostname, kind, status, is_primary")
    .eq("tenant_id", scope.tenantId)
    .in("kind", ["custom", "subdomain"]);

  if (error) {
    logServerError("workspace.settings.removeCustomDomain.lookup", error);
    redirectWithDomainError(tenantSlug, "The saved domain record could not be loaded.", returnTo);
  }

  const rows = (domains ?? []) as Array<{
    id: string;
    hostname: string;
    kind: "custom" | "subdomain";
    status: string;
    is_primary: boolean;
  }>;

  const domain = rows.find((row) => row.hostname === hostname && row.kind === "custom");
  if (!domain) {
    redirectWithDomainError(
      tenantSlug,
      "That custom domain is not attached to this workspace.",
      returnTo,
    );
  }

  if (domain.is_primary) {
    const fallbackHostname = pickFallbackSubdomainHostname(
      rows
        .filter((row) => row.kind === "subdomain")
        .map((row) => ({
          hostname: row.hostname,
          isPrimary: row.is_primary,
        })),
    );

    if (!fallbackHostname) {
      redirectWithDomainError(
        tenantSlug,
        "A branded fallback host is required before the primary custom domain can be removed.",
        returnTo,
      );
    }

    const { error: switchError } = await supabase.rpc("set_primary_agency_domain", {
      p_tenant_id: scope.tenantId,
      p_hostname: fallbackHostname,
    });

    if (switchError) {
      logServerError("workspace.settings.removeCustomDomain.switchPrimary", switchError);
      redirectWithDomainError(
        tenantSlug,
        "The fallback host could not be restored before removal.",
        returnTo,
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("agency_domains")
    .delete()
    .eq("tenant_id", scope.tenantId)
    .eq("kind", "custom")
    .eq("hostname", hostname);

  if (deleteError) {
    logServerError("workspace.settings.removeCustomDomain.delete", deleteError);
    redirectWithDomainError(tenantSlug, "That custom domain could not be removed.", returnTo);
  }

  const vercelRemove = await removeCustomDomainFromVercelProject(hostname);
  if (vercelRemove.attempted && !vercelRemove.removed) {
    logServerError("workspace.settings.removeCustomDomain.vercelRemove", {
      hostname,
      code: vercelRemove.errorCode,
      message: vercelRemove.errorMessage,
    });
  }

  scheduleWorkspaceAudit({
    tenantId: scope.tenantId,
    category: "domain",
    action: "domain.removed",
    summary: `Removed custom domain ${hostname}`,
    targetType: "domain",
    targetLabel: hostname,
  });

  revalidatePath(`/${tenantSlug}/admin/settings`);
  revalidatePath(`/${tenantSlug}/admin/site`);
  redirectWithDomainMessage(
    tenantSlug,
    domain.is_primary
      ? `${hostname} was removed. The branded Tulala fallback host is primary again.`
      : `${hostname} was removed.`,
    returnTo,
  );
}

export async function checkCustomDomainProvisioningAction(formData: FormData): Promise<void> {
  const tenantSlug = readTextField(formData, "tenantSlug");
  const rawHostname = readTextField(formData, "hostname");
  const returnTo = readReturnTo(formData);

  const normalized = normalizeCustomDomainHostname(rawHostname);
  if (!normalized.ok) {
    redirectWithDomainError(tenantSlug, normalized.message, returnTo);
  }

  const { scope, supabase } = await loadManagedDomainContext(tenantSlug, returnTo);
  const hostname = normalized.hostname;

  const { data: domain, error } = await loadCustomDomainVerificationRecord(
    supabase,
    scope.tenantId,
    hostname,
  );

  if (error) {
    logServerError("workspace.settings.checkCustomDomainProvisioning.lookup", error);
    redirectWithDomainError(tenantSlug, "The saved domain record could not be loaded.", returnTo);
  }
  if (!domain) {
    redirectWithDomainError(
      tenantSlug,
      "That custom domain is not attached to this workspace.",
      returnTo,
    );
  }
  if (domain.status === "dns_verification_sent" || domain.status === "pending") {
    redirectWithDomainError(
      tenantSlug,
      `${hostname} still needs TXT verification before routing can be checked.`,
      returnTo,
    );
  }

  try {
    const transition = await syncCustomDomainProvisioning(supabase, domain);
    revalidatePath(`/${tenantSlug}/admin/settings`);
    revalidatePath(`/${tenantSlug}/admin/site`);

    if (transition.status === "active") {
      scheduleWorkspaceAudit({
        tenantId: scope.tenantId,
        category: "domain",
        action: "domain.activated",
        summary: `Custom domain ${hostname} is now live with routing and HTTPS`,
        targetType: "domain",
        targetLabel: hostname,
      });
      redirectWithDomainMessage(
        tenantSlug,
        `${hostname} is now live with routing and HTTPS on Vercel.`,
        returnTo,
      );
    }
    if (transition.status === "ssl_provisioned") {
      redirectWithDomainMessage(
        tenantSlug,
        `${hostname} routing is detected. HTTPS is still finishing on Vercel.`,
        returnTo,
      );
    }
    redirectWithDomainError(
      tenantSlug,
      `Routing records for ${hostname} are not live yet. Add the Vercel A/CNAME record and check again.`,
      returnTo,
    );
  } catch (updateError) {
    logServerError("workspace.settings.checkCustomDomainProvisioning.update", updateError);
    redirectWithDomainError(
      tenantSlug,
      "Routing and SSL could not be checked right now.",
      returnTo,
    );
  }
}
