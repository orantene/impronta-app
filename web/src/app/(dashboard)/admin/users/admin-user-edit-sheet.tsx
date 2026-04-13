"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { adminUpdateUser, type AdminUserActionState } from "@/app/(dashboard)/admin/users/actions";
import {
  adminGetLoginEmailForStaff,
  adminResetTalentClientPassword,
  adminUpdateTalentClientLoginEmail,
  type AdminLoginEmailUpdateState,
  type AdminPasswordResetState,
} from "@/app/(dashboard)/admin/users/password-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { ADMIN_DRAWER_CLASS_MEDIUM } from "@/lib/admin/admin-drawer-classes";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { CanonicalLocationFieldset } from "@/components/location/canonical-location-fieldset";
import {
  loadTalentForAdminUserEdit,
  type LoadedTalentForAdminUserEdit,
} from "@/lib/load-talent-for-admin-user-edit";
import { createClient } from "@/lib/supabase/client";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_OUTLINE_CONTROL_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { Check, Copy, ChevronDown, KeyRound } from "lucide-react";

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  onboarding: "Onboarding",
  active: "Active",
  suspended: "Suspended",
};

const APP_ROLE_LABELS: Record<string, string> = {
  client: "Client",
  talent: "Talent",
  agency_staff: "Agency staff",
  super_admin: "Super admin",
};

export type AdminUserEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  talentProfileId?: string | null;
  /** Optional; shown in copy while data loads */
  profileCode?: string | null;
  userEmail?: string | null;
  className?: string;
  /** Full-page account editor (no sliding panel). */
  presentation?: "sheet" | "inline";
};

type LoadedAccount = {
  profileDisplayName: string | null;
  appRole: string | null;
  accountStatus: string | null;
};

type LoadedClientOrg = {
  company_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  website_url: string | null;
  notes: string | null;
};

export function AdminUserEditSheet({
  open,
  onOpenChange,
  userId,
  talentProfileId,
  profileCode,
  userEmail,
  className,
  presentation = "sheet",
}: AdminUserEditSheetProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminUserActionState, FormData>(
    adminUpdateUser,
    undefined,
  );

  const [pwState, pwFormAction, pwPending] = useActionState<
    AdminPasswordResetState,
    FormData
  >(adminResetTalentClientPassword, undefined);

  const [emailUpdateState, emailUpdateAction, emailUpdatePending] = useActionState<
    AdminLoginEmailUpdateState,
    FormData
  >(adminUpdateTalentClientLoginEmail, undefined);

  const [emailFormNonce, setEmailFormNonce] = useState(0);

  const [passwordCopied, setPasswordCopied] = useState(false);

  const [loginEmailState, setLoginEmailState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; email: string | null }
  >({ status: "idle" });

  const [loaded, setLoaded] = useState<
    | null
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        account: LoadedAccount;
        talent: LoadedTalentForAdminUserEdit | null;
        clientOrg: LoadedClientOrg | null;
      }
  >(null);

  useEffect(() => {
    if (!state?.success) return;
    if (presentation === "inline" && talentProfileId) {
      router.push(`/admin/talent/${talentProfileId}`);
      return;
    }
    onOpenChange(false);
  }, [state?.success, onOpenChange, presentation, talentProfileId, router]);

  useEffect(() => {
    setPasswordCopied(false);
  }, [pwState]);

  useEffect(() => {
    if (emailUpdateState && "success" in emailUpdateState && emailUpdateState.success) {
      setLoginEmailState({ status: "ready", email: emailUpdateState.newEmail });
      setEmailFormNonce((n) => n + 1);
    }
  }, [emailUpdateState]);

  const panelActive = open || presentation === "inline";

  useEffect(() => {
    if (!panelActive || !userId) {
      setLoginEmailState({ status: "idle" });
      return;
    }
    if (userEmail != null && userEmail !== "") {
      setLoginEmailState({ status: "ready", email: userEmail });
      return;
    }
    let cancelled = false;
    setLoginEmailState({ status: "loading" });
    void adminGetLoginEmailForStaff(userId).then((res) => {
      if (cancelled) return;
      setLoginEmailState({ status: "ready", email: res.email });
    });
    return () => {
      cancelled = true;
    };
  }, [panelActive, userId, userEmail]);

  useEffect(() => {
    if (!open && presentation !== "inline") {
      setLoaded(null);
      return;
    }
    if (presentation === "inline" && !userId) {
      setLoaded(null);
      return;
    }
    if (!userId) {
      setLoaded({ status: "error", message: "Missing user." });
      return;
    }

    let cancelled = false;
    setLoaded({ status: "loading" });

    (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) setLoaded({ status: "error", message: "Supabase not configured." });
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("display_name, app_role, account_status")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (profErr || !prof) {
        setLoaded({
          status: "error",
          message: profErr?.message ?? "Could not load account.",
        });
        return;
      }

      const account: LoadedAccount = {
        profileDisplayName: (prof.display_name as string | null) ?? null,
        appRole: (prof.app_role as string | null) ?? null,
        accountStatus: (prof.account_status as string | null) ?? null,
      };

      const loadClientOrg = async (): Promise<LoadedClientOrg | null> => {
        if (account.appRole !== "client") return null;
        const { data: row } = await supabase
          .from("client_profiles")
          .select("company_name, phone, whatsapp_phone, website_url, notes")
          .eq("user_id", userId)
          .maybeSingle();
        if (!row) {
          return {
            company_name: null,
            phone: null,
            whatsapp_phone: null,
            website_url: null,
            notes: null,
          };
        }
        return {
          company_name: (row.company_name as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          whatsapp_phone: (row.whatsapp_phone as string | null) ?? null,
          website_url: (row.website_url as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
        };
      };

      if (!talentProfileId) {
        const clientOrg = await loadClientOrg();
        if (cancelled) return;
        setLoaded({ status: "ready", account, talent: null, clientOrg });
        return;
      }

      const { data: talent, error: talentErr } = await loadTalentForAdminUserEdit(
        supabase,
        talentProfileId,
      );

      if (cancelled) return;

      if (talentErr || !talent) {
        setLoaded({
          status: "error",
          message: talentErr ?? "Could not load talent profile.",
        });
        return;
      }

      const clientOrg = await loadClientOrg();
      if (cancelled) return;
      setLoaded({ status: "ready", account, talent, clientOrg });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, presentation, userId, talentProfileId]);

  const formKey =
    loaded?.status === "ready"
      ? `${userId}-${talentProfileId ?? "no-tp"}-${loaded.talent?.profile_code ?? ""}`
      : "pending";

  /** Separate from main save form (no nested forms); fields use the `form` attribute. */
  const loginEmailFormDomId =
    loaded?.status === "ready" ? `admin-user-login-email-${userId}` : "admin-user-login-email-pending";

  const codeLabel = profileCode ?? (loaded?.status === "ready" ? loaded.talent?.profile_code : null);

  const inner = (
        <div className={cn("min-h-0 flex-1 overflow-y-auto pr-1", presentation === "inline" && "pr-0")}>
          {loaded?.status === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading profile data…</p>
          ) : null}

          {loaded?.status === "error" ? (
            <p className="text-sm text-destructive">{loaded.message}</p>
          ) : null}

          {loaded?.status === "ready" ? (
            <>
              <form id={loginEmailFormDomId} action={emailUpdateAction} hidden>
                <input type="hidden" name="user_id" value={userId} />
              </form>
              <form key={formKey} action={formAction} className="space-y-5 pb-2">
                <input type="hidden" name="user_id" value={userId} />
                <input type="hidden" name="talent_profile_id" value={talentProfileId ?? ""} />

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Account
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {loaded.talent
                      ? "Login identity and access. Linked talent profile fields are below."
                      : loaded.clientOrg
                        ? "Login identity, access, and this client’s organization details on file."
                        : "Login identity and access. Open a user from a talent record to edit public profile, locations, and workflow."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="display_name">Display name</Label>
                  <Input
                    id="display_name"
                    name="display_name"
                    defaultValue={loaded.account.profileDisplayName ?? ""}
                    placeholder="Name shown in the app"
                    className={ADMIN_FORM_CONTROL}
                  />
                  <div className="space-y-1 rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Login email
                    </Label>
                    {loginEmailState.status === "loading" || loginEmailState.status === "idle" ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : loginEmailState.email ? (
                      <p className="break-all font-mono text-sm text-foreground">{loginEmailState.email}</p>
                    ) : (
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>No email returned for this login (phone/OAuth-only accounts may have none).</p>
                        <p className="text-[11px] leading-relaxed">
                          If you expected an address, ensure{" "}
                          <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> is set so staff can read
                          Auth.
                        </p>
                      </div>
                    )}
                  </div>

                  {(loaded.account.appRole === "talent" ||
                    loaded.account.appRole === "client") && (
                    <div
                      key={emailFormNonce}
                      className="space-y-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-3"
                    >
                      <div className="space-y-1">
                        <Label htmlFor="new_login_email">Change login email</Label>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Updates Supabase Auth (confirmed by admin). Fails if the address is already
                          registered. Password is unchanged unless you reset it below.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <Input
                          id="new_login_email"
                          form={loginEmailFormDomId}
                          name="new_login_email"
                          type="email"
                          autoComplete="off"
                          placeholder="new.address@example.com"
                          className={cn(ADMIN_FORM_CONTROL, "sm:min-w-0 sm:flex-1")}
                        />
                        <Button
                          type="submit"
                          form={loginEmailFormDomId}
                          variant="outline"
                          size="sm"
                          disabled={emailUpdatePending}
                          className={cn("shrink-0 rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                        >
                          {emailUpdatePending ? "Updating…" : "Update email"}
                        </Button>
                      </div>
                      {emailUpdateState && "error" in emailUpdateState ? (
                        <p className="text-sm text-destructive">{emailUpdateState.error}</p>
                      ) : null}
                      {emailUpdateState && "success" in emailUpdateState && emailUpdateState.success ? (
                        <p className="text-sm text-foreground">{emailUpdateState.message}</p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="account_status">Account status</Label>
                    <select
                      id="account_status"
                      name="account_status"
                      defaultValue={loaded.account.accountStatus ?? "registered"}
                      className={ADMIN_FORM_CONTROL}
                    >
                      {["registered", "onboarding", "active", "suspended"].map((s) => (
                        <option key={s} value={s}>
                          {ACCOUNT_STATUS_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="app_role">App role</Label>
                    <select
                      id="app_role"
                      name="app_role"
                      defaultValue={loaded.account.appRole ?? "client"}
                      className={ADMIN_FORM_CONTROL}
                    >
                      {["client", "talent", "agency_staff", "super_admin"].map((r) => (
                        <option key={r} value={r}>
                          {APP_ROLE_LABELS[r] ?? r}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Changing role requires super-admin privileges.
                    </p>
                  </div>
                </div>

                {loaded.clientOrg ? (
                  <div className="space-y-4 border-t border-border/50 pt-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Client organization
                      </p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Company and contact info (same as the client admin profile).
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="client_company_name">Company name</Label>
                      <Input
                        id="client_company_name"
                        name="client_company_name"
                        defaultValue={loaded.clientOrg.company_name ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="client_phone">Phone</Label>
                        <Input
                          id="client_phone"
                          name="client_phone"
                          type="tel"
                          defaultValue={loaded.clientOrg.phone ?? ""}
                          className={ADMIN_FORM_CONTROL}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="client_whatsapp_phone">WhatsApp</Label>
                        <Input
                          id="client_whatsapp_phone"
                          name="client_whatsapp_phone"
                          type="tel"
                          defaultValue={loaded.clientOrg.whatsapp_phone ?? ""}
                          className={ADMIN_FORM_CONTROL}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="client_website_url">Website</Label>
                      <Input
                        id="client_website_url"
                        name="client_website_url"
                        type="url"
                        inputMode="url"
                        placeholder="https://"
                        defaultValue={loaded.clientOrg.website_url ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="client_notes">Internal notes</Label>
                      <textarea
                        id="client_notes"
                        name="client_notes"
                        rows={3}
                        defaultValue={loaded.clientOrg.notes ?? ""}
                        placeholder="Staff-only notes for this client"
                        className="min-h-[88px] w-full rounded-2xl border-border/55 bg-background/90 px-3.5 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/20"
                      />
                    </div>
                  </div>
                ) : null}

                {loaded.talent ? (
                <>
                  <div className="border-t border-border/50 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Talent profile
                    </p>
                    {codeLabel ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{codeLabel}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="talent_display_name">Display name (public)</Label>
                      <Input
                        id="talent_display_name"
                        name="talent_display_name"
                        defaultValue={loaded.talent.display_name ?? ""}
                        placeholder="Shown on public talent profile"
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="first_name">First name</Label>
                      <Input
                        id="first_name"
                        name="first_name"
                        defaultValue={loaded.talent.first_name ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="last_name">Last name</Label>
                      <Input
                        id="last_name"
                        name="last_name"
                        defaultValue={loaded.talent.last_name ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        defaultValue={loaded.talent.phone ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gender">Gender</Label>
                      <select
                        id="gender"
                        name="gender"
                        defaultValue={loaded.talent.gender ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      >
                        <option value="">—</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="non_binary">Non-binary</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="date_of_birth">Date of birth</Label>
                      <Input
                        id="date_of_birth"
                        name="date_of_birth"
                        type="date"
                        defaultValue={loaded.talent.date_of_birth ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      />
                    </div>
                  </div>

                  <CanonicalLocationFieldset
                    prefix="residence"
                    title="Lives in"
                    countryLabel="Residence country"
                    cityLabel="Residence city"
                    required
                    helperText="Canonical base location used for profile display and directory filtering."
                    initial={loaded.talent.initialResidence}
                  />

                  <CanonicalLocationFieldset
                    prefix="origin"
                    title="Originally from"
                    countryLabel="Origin country"
                    cityLabel="Origin city"
                    helperText="Optional. Set both country and city or leave both empty."
                    initial={loaded.talent.initialOrigin}
                  />

                  <div className="space-y-1.5">
                    <Label htmlFor="short_bio">Short bio (public)</Label>
                    <textarea
                      id="short_bio"
                      name="short_bio"
                      defaultValue={loaded.talent.short_bio ?? ""}
                      rows={4}
                      className="min-h-[100px] w-full rounded-2xl border-border/55 bg-background/90 px-3.5 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/20"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="workflow_status">Workflow status</Label>
                      <select
                        id="workflow_status"
                        name="workflow_status"
                        defaultValue={loaded.talent.workflow_status}
                        className={ADMIN_FORM_CONTROL}
                      >
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                        <option value="under_review">Under review</option>
                        <option value="approved">Approved</option>
                        <option value="hidden">Hidden</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="visibility">Visibility</Label>
                      <select
                        id="visibility"
                        name="visibility"
                        defaultValue={loaded.talent.visibility}
                        className={ADMIN_FORM_CONTROL}
                      >
                        <option value="hidden">Hidden</option>
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="membership_tier">Membership tier</Label>
                      <select
                        id="membership_tier"
                        name="membership_tier"
                        defaultValue={loaded.talent.membership_tier ?? ""}
                        className={ADMIN_FORM_CONTROL}
                      >
                        <option value="">—</option>
                        <option value="free">Free</option>
                        <option value="free_trial">Free trial</option>
                        <option value="premium">Premium</option>
                        <option value="featured">Featured</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Featured in directory</Label>
                      <div className="flex h-10 items-center gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="is_featured"
                            value="true"
                            defaultChecked={loaded.talent.is_featured}
                          />
                          Yes
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="is_featured"
                            value="false"
                            defaultChecked={!loaded.talent.is_featured}
                          />
                          No
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="decision_note">Agency note (optional)</Label>
                    <textarea
                      id="decision_note"
                      name="decision_note"
                      rows={2}
                      placeholder="Stored on workflow events when status or visibility changes."
                      className="min-h-[88px] w-full rounded-2xl border-border/55 bg-background/90 px-3.5 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/20"
                    />
                  </div>
                </>
              ) : null}

                {state?.error ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                    {state.error}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-4">
                  {presentation === "inline" && talentProfileId ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                      asChild
                    >
                      <Link href={`/admin/talent/${talentProfileId}`} scroll={false}>
                        Back to hub
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                      onClick={() => onOpenChange(false)}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={pending}
                    className={cn(
                      "h-11 min-w-[160px] rounded-2xl text-[15px] font-semibold",
                      LUXURY_GOLD_BUTTON_CLASS,
                    )}
                  >
                    {pending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>

              {(loaded.account.appRole === "talent" ||
                loaded.account.appRole === "client") && (
                <details className="group mt-2 rounded-2xl border border-border/40 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/25">
                    <span className="flex items-center gap-2">
                      <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                      Sign-in password (admin)
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Reset the password for this email login. If generating a temporary password
                      fails, confirm the server has the Supabase service role key configured.
                    </p>

                    <form action={pwFormAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="user_id" value={userId} />
                      <input type="hidden" name="mode" value="generate" />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={pwPending}
                        className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                      >
                        {pwPending ? "Working…" : "Generate & set new password"}
                      </Button>
                    </form>

                    <form
                      action={pwFormAction}
                      className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    >
                      <input type="hidden" name="user_id" value={userId} />
                      <input type="hidden" name="mode" value="custom" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor="admin_new_password">Set a specific password</Label>
                        <Input
                          id="admin_new_password"
                          name="new_password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                          minLength={8}
                          className={ADMIN_FORM_CONTROL}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={pwPending}
                        className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
                      >
                        Set password
                      </Button>
                    </form>

                    {pwState && "error" in pwState ? (
                      <p className="text-sm text-destructive">{pwState.error}</p>
                    ) : null}
                    {pwState && "success" in pwState && pwState.success ? (
                      <div className="space-y-2 rounded-2xl border border-border/45 bg-card/50 p-4 shadow-sm">
                        <p className="text-sm text-foreground">{pwState.message}</p>
                        {pwState.temporaryPassword ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="min-w-0 flex-1 break-all rounded border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-xs">
                              {pwState.temporaryPassword}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={async () => {
                                const text = pwState.temporaryPassword;
                                if (!text) return;
                                try {
                                  await navigator.clipboard.writeText(text);
                                  setPasswordCopied(true);
                                  setTimeout(() => setPasswordCopied(false), 2000);
                                } catch {
                                  /* ignore */
                                }
                              }}
                            >
                              {passwordCopied ? (
                                <>
                                  <Check className="mr-1 size-3.5" aria-hidden />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 size-3.5" aria-hidden />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </details>
              )}
            </>
          ) : null}
        </div>
  );

  if (presentation === "inline") {
    return (
      <DashboardSectionCard
        title="Account & login"
        description="Account status, role, client organization (for clients), and linked talent profile when opened from a talent record."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        className={className}
      >
        {inner}
      </DashboardSectionCard>
    );
  }

  return (
    <DashboardEditPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Account & login"
      description="Account access, client organization for client logins, and full public talent fields when this sheet is opened with a linked talent profile."
      className={cn(ADMIN_DRAWER_CLASS_MEDIUM, className)}
    >
      {inner}
    </DashboardEditPanel>
  );
}
