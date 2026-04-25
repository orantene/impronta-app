"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Crown,
  Download,
  Eye,
  Globe,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Drawer design system preview.
 *
 * Four drawer types stacked into one page, switchable via `?d=` query.
 * Goal: prove the visual language scales across (a) settings + media,
 * (b) pricing + meters, (c) list + roles, (d) status + table.
 *
 * Shared primitives (defined inline below):
 *   - Card        rounded-xl, hairline border, white bg, p-4
 *   - IconChip    34/44 px rounded square, cream bg, inset 1px border
 *   - HeaderRow   icon chip + title + sub + optional right slot
 *   - SectionLabel    only used between cards, never inside
 *   - StickyFooter    discard left, primary CTA right
 *
 * Cards merge concerns. Avoid label-on-label list pages — always pair the
 * setting with its preview/state in the same card.
 */

const DRAWERS = [
  { id: "branding", label: "Branding" },
  { id: "plan", label: "Plan & Billing" },
  { id: "team", label: "Team" },
  { id: "domain", label: "Domain" },
];

export default function DrawerPreviewPage() {
  const sp = useSearchParams();
  const active = (sp?.get("d") ?? "branding") as
    | "branding"
    | "plan"
    | "team"
    | "domain";

  return (
    <div
      data-dashboard-theme="light"
      className="dashboard-theme-light min-h-screen bg-[#fafaf9]"
    >
      {/* Tab switcher */}
      <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2">
        <div className="flex gap-1 rounded-full border border-[rgba(24,24,27,0.12)] bg-white p-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
          {DRAWERS.map((d) => (
            <Link
              key={d.id}
              href={`?d=${d.id}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                active === d.id
                  ? "bg-foreground text-background"
                  : "text-foreground/70 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {d.label}
            </Link>
          ))}
        </div>
      </div>

      <FadedBackdrop active={active} />

      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />

      {active === "branding" ? <BrandingDrawer /> : null}
      {active === "plan" ? <PlanDrawer /> : null}
      {active === "team" ? <TeamDrawer /> : null}
      {active === "domain" ? <DomainDrawer /> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function DrawerPanel({ children }: { children: React.ReactNode }) {
  return (
    <aside
      role="dialog"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col border-l border-[rgba(24,24,27,0.1)] bg-popover text-popover-foreground shadow-2xl"
    >
      {children}
    </aside>
  );
}

function DrawerHeader({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(24,24,27,0.08)] px-6 pt-5 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f5f4ef] text-foreground shadow-[inset_0_0_0_1px_rgba(24,24,27,0.12)]"
        >
          <Icon className="size-[17px]" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {sub}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </header>
  );
}

function DrawerBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-5">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StickyFooter({
  primary,
  primaryClassName,
  secondaryLabel = "Discard changes",
  meta,
}: {
  primary: string;
  primaryClassName?: string;
  secondaryLabel?: string;
  meta?: string;
}) {
  return (
    <div className="shrink-0 border-t border-[rgba(24,24,27,0.08)] bg-background/95 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <Undo2 className="size-3.5" aria-hidden />
          {secondaryLabel}
        </button>
        <div className="flex items-center gap-2.5">
          {meta ? (
            <span className="text-[11px] text-muted-foreground">{meta}</span>
          ) : null}
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-opacity hover:opacity-90",
              primaryClassName ?? "bg-foreground text-background",
            )}
          >
            {primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[rgba(24,24,27,0.1)] bg-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

function CardDivider() {
  return <div className="border-t border-[rgba(24,24,27,0.08)]" />;
}

function IconChip({
  icon: Icon,
  size = 34,
}: {
  icon: React.ComponentType<{ className?: string }>;
  size?: 34 | 44;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] bg-[#f5f4ef] text-foreground shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)]",
        size === 34 ? "size-[34px]" : "size-[44px]",
      )}
    >
      <Icon className={size === 34 ? "size-[15px]" : "size-[18px]"} />
    </span>
  );
}

function CapsLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      <Eye className="size-3" aria-hidden />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Branding drawer — revised: 3 substantial cards, each with preview built-in
// ─────────────────────────────────────────────────────────────────────────────

const DISPLAY_FONT = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
const BODY_FONT = '"Inter", system-ui, sans-serif';

const PALETTE = {
  primary: "#B8860B",
  foreground: "#0B0B0D",
  background: "#FAFAF7",
};

function BrandingDrawer() {
  return (
    <DrawerPanel>
      <DrawerHeader
        icon={Sparkles}
        title="Branding"
        sub="Logo, palette, typography — survives theme swaps."
      />
      <DrawerBody>
        <BrandCard />
        <PaletteCard />
        <TypographyCard />
      </DrawerBody>
      <StickyFooter primary="Save branding" meta="3 unsaved" />
    </DrawerPanel>
  );
}

function BrandCard() {
  return (
    <Card>
      <CardSection>
        <div className="mb-3 flex items-center justify-between">
          <CapsLabel>Brand</CapsLabel>
          <button
            type="button"
            aria-label="Edit"
            className="flex size-7 items-center justify-center rounded-md border border-[rgba(24,24,27,0.1)] bg-white text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-[64px] shrink-0 items-center justify-center rounded-2xl bg-[#f5f4ef] text-[22px] font-semibold text-foreground shadow-[inset_0_0_0_1px_rgba(24,24,27,0.12)]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            T
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-[24px] font-semibold leading-[1.05] tracking-[-0.005em] text-foreground"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Tulala
            </h3>
            <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
              Editorial talent agency
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[rgba(24,24,27,0.1)] bg-white px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
              <span className="size-3 rounded-sm bg-[#f5f4ef] shadow-[inset_0_0_0_1px_rgba(24,24,27,0.15)]" />
              Favicon · tulala-32.png
            </div>
          </div>
        </div>
      </CardSection>
      <CardDivider />
      <CardSection className="bg-[#fafaf9]">
        <div className="flex items-center gap-2">
          <button className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(24,24,27,0.1)] bg-white px-2 text-[11px] font-medium text-foreground hover:border-foreground/30">
            <ImagePlus className="size-3" aria-hidden />
            Replace logo
          </button>
          <button className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(24,24,27,0.1)] bg-white px-2 text-[11px] font-medium text-foreground hover:border-foreground/30">
            <ImagePlus className="size-3" aria-hidden />
            Replace favicon
          </button>
          <button className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-white hover:text-foreground">
            <Trash2 className="size-3" aria-hidden />
            Reset
          </button>
        </div>
      </CardSection>
    </Card>
  );
}

function PaletteCard() {
  return (
    <Card>
      <CardSection>
        <CapsLabel className="mb-3">Palette</CapsLabel>
        <div className="grid grid-cols-3 gap-2">
          {[
            { role: "Primary", value: PALETTE.primary, dim: false },
            { role: "Foreground", value: PALETTE.foreground, dim: false },
            { role: "Background", value: PALETTE.background, dim: true },
          ].map((c) => (
            <button
              key={c.role}
              type="button"
              className="flex items-center gap-2.5 rounded-lg border border-[rgba(24,24,27,0.1)] bg-white px-2.5 py-2 text-left transition-colors hover:border-foreground/30"
            >
              <span
                className={cn(
                  "size-7 shrink-0 rounded-full",
                  c.dim
                    ? "border border-[rgba(24,24,27,0.15)]"
                    : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
                )}
                style={{ backgroundColor: c.value }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {c.role}
                </p>
                <p className="font-mono text-[11.5px] font-semibold tabular-nums text-foreground">
                  {c.value.toUpperCase()}
                </p>
              </div>
            </button>
          ))}
        </div>
      </CardSection>
      <CardDivider />
      <CardSection className="bg-[#fafaf7]" >
        <PreviewLabel>In context</PreviewLabel>
        {/* Faux profile mini-card painted with the palette */}
        <div
          className="rounded-xl border border-[rgba(24,24,27,0.1)] bg-white p-4"
          style={{ backgroundColor: PALETTE.background }}
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[12px] font-semibold"
              style={{ color: PALETTE.foreground }}
            >
              ML
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[14px] font-semibold leading-tight"
                style={{ fontFamily: DISPLAY_FONT, color: PALETTE.foreground }}
              >
                Mia Lin
              </p>
              <p
                className="text-[11.5px]"
                style={{ color: PALETTE.foreground, opacity: 0.6 }}
              >
                Editorial talent · Lisbon
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-full px-3.5 text-[11.5px] font-semibold"
              style={{ backgroundColor: PALETTE.primary, color: "#fff" }}
            >
              View profile
            </button>
          </div>
        </div>
      </CardSection>
    </Card>
  );
}

function TypographyCard() {
  return (
    <Card>
      <CardSection>
        <CapsLabel className="mb-3">Typography</CapsLabel>
        <div className="space-y-2">
          <FontPickerRow
            label="Display font"
            sub="Headings · workspace name"
            sample="Cormorant"
            css={DISPLAY_FONT}
          />
          <FontPickerRow
            label="Body font"
            sub="Paragraphs · UI"
            sample="Inter"
            css={BODY_FONT}
          />
        </div>
      </CardSection>
      <CardDivider />
      <CardSection className="bg-[#fafaf9]">
        <PreviewLabel>Pairing preview</PreviewLabel>
        <p
          className="text-[24px] font-semibold leading-[1.08] tracking-[-0.005em] text-foreground"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Editorial talent. Effortless booking.
        </p>
        <p
          className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground"
          style={{ fontFamily: BODY_FONT }}
        >
          Body copy uses Inter for clarity at small sizes, paired with
          Cormorant for editorial weight on display text.
        </p>
      </CardSection>
    </Card>
  );
}

function FontPickerRow({
  label,
  sub,
  sample,
  css,
}: {
  label: string;
  sub: string;
  sample: string;
  css: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[rgba(24,24,27,0.1)] bg-white px-3 py-2.5 text-left transition-colors hover:border-foreground/30"
    >
      <div className="flex items-center gap-3">
        <IconChip icon={Type} />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p
            className="text-[14.5px] font-semibold leading-tight text-foreground"
            style={{ fontFamily: css }}
          >
            {sample}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </div>
      <ChevronDown
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Plan & Billing drawer
// ─────────────────────────────────────────────────────────────────────────────

function PlanDrawer() {
  return (
    <DrawerPanel>
      <DrawerHeader
        icon={Crown}
        title="Plan & Billing"
        sub="Studio plan · renews May 12 · €49/mo"
      />
      <DrawerBody>
        <PlanCard />
        <PaymentCard />
        <InvoicesCard />
      </DrawerBody>
      <StickyFooter
        primary="Compare plans"
        secondaryLabel="Cancel plan"
        meta=""
      />
    </DrawerPanel>
  );
}

function PlanCard() {
  return (
    <Card>
      <CardSection>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <CapsLabel>Current plan</CapsLabel>
            <div className="mt-1.5 flex items-baseline gap-2">
              <h3
                className="text-[22px] font-semibold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                Studio
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                <span className="size-1.5 rounded-full bg-blue-500" />
                Active
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              €49/mo · renews May 12, 2026
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[24px] font-semibold tabular-nums leading-none text-foreground">
              €49
            </p>
            <p className="mt-1 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
              per month
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[rgba(24,24,27,0.08)] bg-[#fafaf9] p-3">
          <div className="flex items-baseline justify-between">
            <CapsLabel>Roster usage</CapsLabel>
            <p className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
              12 / 25
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(24,24,27,0.08)]">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: "48%" }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            13 talent slots remaining on your plan.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Widgets", value: "2" },
            { label: "Inquiries / mo", value: "84" },
            { label: "Team seats", value: "3 / 5" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[rgba(24,24,27,0.08)] bg-white p-2.5"
            >
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-foreground">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </CardSection>
      <CardDivider />
      <CardSection className="bg-[#fafaf9]">
        <Link
          href="#"
          className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground hover:underline"
        >
          Upgrade to Agency for €99/mo
          <ArrowUpRight className="size-3.5" aria-hidden />
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            Unlock 100 talents · multi-agency
          </span>
        </Link>
      </CardSection>
    </Card>
  );
}

function PaymentCard() {
  return (
    <Card>
      <CardSection>
        <div className="mb-3 flex items-center justify-between">
          <CapsLabel>Payment method</CapsLabel>
          <button className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground">
            Update
          </button>
        </div>
        <div className="flex items-center gap-3">
          <IconChip icon={CreditCard} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-foreground">
              Visa ending in 4242
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Expires 04/29 · billing@tulala.com
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
            <CheckCircle2 className="size-3" />
            Verified
          </span>
        </div>
      </CardSection>
    </Card>
  );
}

function InvoicesCard() {
  const invoices = [
    { id: "INV-204", date: "Apr 12, 2026", amount: "€49.00", status: "Paid" },
    { id: "INV-203", date: "Mar 12, 2026", amount: "€49.00", status: "Paid" },
    { id: "INV-202", date: "Feb 12, 2026", amount: "€49.00", status: "Paid" },
  ];
  return (
    <Card>
      <CardSection>
        <div className="mb-2 flex items-center justify-between">
          <CapsLabel>Recent invoices</CapsLabel>
          <Link
            href="#"
            className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            View all
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <ul className="divide-y divide-[rgba(24,24,27,0.06)]">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 py-2.5 text-[12.5px]"
            >
              <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {inv.id}
              </span>
              <span className="text-foreground">{inv.date}</span>
              <span className="ml-auto font-mono font-semibold tabular-nums text-foreground">
                {inv.amount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                {inv.status}
              </span>
              <button
                aria-label="Download"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <Download className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </CardSection>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Team drawer
// ─────────────────────────────────────────────────────────────────────────────

function TeamDrawer() {
  return (
    <DrawerPanel>
      <DrawerHeader
        icon={Users}
        title="Team & Permissions"
        sub="3 of 5 seats used · Studio plan"
      />
      <DrawerBody>
        <TeamMembersCard />
        <PendingInvitesCard />
        <RolesCard />
      </DrawerBody>
      <StickyFooter
        primary="Invite member"
        primaryClassName="bg-foreground text-background"
        secondaryLabel="Manage roles"
      />
    </DrawerPanel>
  );
}

function TeamMembersCard() {
  const members = [
    { name: "Oran Tene", email: "oran@tulala.com", role: "Owner", initials: "OT", you: true },
    { name: "Lucia Romano", email: "lucia@tulala.com", role: "Admin", initials: "LR" },
    { name: "Marco Bianchi", email: "marco@tulala.com", role: "Coordinator", initials: "MB" },
  ];
  return (
    <Card>
      <CardSection>
        <div className="mb-3 flex items-center justify-between">
          <CapsLabel>Members</CapsLabel>
          <button className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(24,24,27,0.1)] bg-white px-2 text-[11.5px] font-medium text-foreground hover:border-foreground/30">
            <UserPlus className="size-3" />
            Invite
          </button>
        </div>
        <ul className="-mx-2 divide-y divide-[rgba(24,24,27,0.06)]">
          {members.map((m) => (
            <li
              key={m.email}
              className="flex items-center gap-3 px-2 py-2.5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[11.5px] font-semibold text-foreground">
                {m.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  {m.name}
                  {m.you ? (
                    <span className="rounded-sm bg-foreground/[0.08] px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.14em] text-foreground/80">
                      you
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {m.email}
                </p>
              </div>
              <button
                type="button"
                disabled={m.you}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(24,24,27,0.1)] bg-white px-2 text-[11.5px] font-medium text-foreground transition-colors hover:border-foreground/30",
                  m.you && "cursor-not-allowed opacity-50",
                )}
              >
                {m.role}
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
              <button
                aria-label="More"
                disabled={m.you}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  m.you && "cursor-not-allowed opacity-30",
                )}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </CardSection>
    </Card>
  );
}

function PendingInvitesCard() {
  return (
    <Card>
      <CardSection>
        <div className="mb-2.5 flex items-center justify-between">
          <CapsLabel>Pending invites · 1</CapsLabel>
          <button className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground">
            Resend all
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-[rgba(24,24,27,0.18)] bg-[#fafaf9] px-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[rgba(24,24,27,0.2)] bg-white text-muted-foreground">
            <UserPlus className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-foreground">
              elena@studio-rossi.com
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Invited 2 days ago · Coordinator
            </p>
          </div>
          <button className="inline-flex h-7 items-center rounded-md border border-[rgba(24,24,27,0.1)] bg-white px-2 text-[11.5px] font-medium text-foreground hover:border-foreground/30">
            Resend
          </button>
        </div>
      </CardSection>
    </Card>
  );
}

function RolesCard() {
  const roles = [
    { name: "Owner", desc: "Full access · single seat", icon: Crown },
    { name: "Admin", desc: "Settings, billing, team", icon: ShieldCheck },
    { name: "Coordinator", desc: "Inquiries, bookings, talent", icon: Users },
  ];
  return (
    <Card>
      <CardSection>
        <CapsLabel className="mb-3">Roles</CapsLabel>
        <ul className="space-y-1.5">
          {roles.map((r) => (
            <li
              key={r.name}
              className="flex items-center gap-3 rounded-lg border border-[rgba(24,24,27,0.08)] bg-[#fafaf9] px-3 py-2"
            >
              <IconChip icon={r.icon} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground">
                  {r.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.desc}
                </p>
              </div>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </CardSection>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Domain drawer
// ─────────────────────────────────────────────────────────────────────────────

function DomainDrawer() {
  return (
    <DrawerPanel>
      <DrawerHeader
        icon={Globe}
        title="Domain"
        sub="tulala.digital · SSL active · auto-renews"
      />
      <DrawerBody>
        <DomainStatusCard />
        <DnsRecordsCard />
        <AddCustomDomainCard />
      </DrawerBody>
      <StickyFooter primary="Save changes" meta="No unsaved changes" />
    </DrawerPanel>
  );
}

function DomainStatusCard() {
  return (
    <Card>
      <CardSection>
        <div className="mb-3 flex items-center justify-between">
          <CapsLabel>Primary domain</CapsLabel>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </div>
        <div className="flex items-center gap-3">
          <IconChip icon={Globe} size={44} />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[18px] font-semibold leading-tight tracking-tight text-foreground"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              tulala.digital
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              SSL valid until Apr 19, 2027 · auto-renews
            </p>
          </div>
          <button
            aria-label="Open"
            className="flex size-8 items-center justify-center rounded-md border border-[rgba(24,24,27,0.1)] bg-white text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </CardSection>
      <CardDivider />
      <CardSection className="bg-[#fafaf9]">
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "Resolves", v: "Yes" },
            { l: "TTL", v: "3600" },
            { l: "Provider", v: "Vercel" },
          ].map((m) => (
            <div key={m.l}>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {m.l}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-foreground">
                {m.v}
              </p>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  );
}

function DnsRecordsCard() {
  const records = [
    { type: "A", name: "@", value: "76.76.21.21", status: "ok" },
    { type: "CNAME", name: "www", value: "cname.vercel-dns.com", status: "ok" },
    { type: "TXT", name: "_vercel", value: "vc-domain-verify=…", status: "ok" },
    { type: "MX", name: "@", value: "mail.protonmail.ch", status: "warn" },
  ];
  return (
    <Card>
      <CardSection>
        <div className="mb-2 flex items-center justify-between">
          <CapsLabel>DNS records</CapsLabel>
          <button className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground">
            <Copy className="size-3" />
            Copy all
          </button>
        </div>
        <ul className="-mx-1 divide-y divide-[rgba(24,24,27,0.06)]">
          {records.map((r, i) => (
            <li key={i} className="flex items-center gap-3 px-1 py-2.5">
              <span className="flex h-6 w-12 items-center justify-center rounded-md bg-foreground/[0.06] font-mono text-[10.5px] font-bold tracking-wider text-foreground">
                {r.type}
              </span>
              <span className="font-mono text-[11.5px] font-semibold text-foreground">
                {r.name}
              </span>
              <span className="ml-2 truncate font-mono text-[11.5px] text-muted-foreground">
                {r.value}
              </span>
              <span
                className={cn(
                  "ml-auto inline-flex size-2 rounded-full",
                  r.status === "ok" ? "bg-emerald-500" : "bg-amber-500",
                )}
                aria-label={r.status === "ok" ? "OK" : "Warning"}
              />
              <button
                aria-label="Copy"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <Copy className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      </CardSection>
    </Card>
  );
}

function AddCustomDomainCard() {
  return (
    <Card className="border-dashed">
      <CardSection>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-[rgba(24,24,27,0.18)] bg-[#fafaf9] text-muted-foreground"
          >
            <Plus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-foreground">
              Add custom domain
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Connect a domain you own — guided DNS setup.
            </p>
          </div>
          <button className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-[11.5px] font-semibold text-background hover:opacity-90">
            Add domain
          </button>
        </div>
      </CardSection>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Faded backdrop (the parent page faintly behind the drawer overlay)
// ─────────────────────────────────────────────────────────────────────────────

function FadedBackdrop({
  active,
}: {
  active: "branding" | "plan" | "team" | "domain";
}) {
  const titles: Record<typeof active, string> = {
    branding: "Site control center",
    plan: "Account",
    team: "Account",
    domain: "Site control center",
  };
  return (
    <div className="absolute inset-0 p-8">
      <div className="mx-auto max-w-5xl space-y-4 pt-16 text-zinc-700">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          {titles[active]}
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900">
          {titles[active]}
        </h1>
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            "Roster",
            "Directory",
            "Inquiries",
            "Branding",
            "Activity",
            "Domain",
          ].map((c) => (
            <div
              key={c}
              className="flex items-center gap-3 rounded-xl border border-[rgba(24,24,27,0.1)] bg-white px-3.5 py-3"
            >
              <span className="size-[34px] shrink-0 rounded-[9px] bg-[#f5f4ef] shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)]" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold">{c}</p>
                <p className="text-[11.5px] text-zinc-500">subtitle text</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
