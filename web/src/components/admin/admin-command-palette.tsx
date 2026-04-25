"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CalendarRange,
  FolderTree,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  ListFilter,
  MapPin,
  MessageSquare,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  User,
  UserRound,
  Users,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { AdminSearchResponse } from "@/app/api/admin/search/route";

type NavLink = {
  href: string;
  label: string;
  category: string;
  hint: string;
  /** Extra tokens matched by the palette filter (not shown). */
  keywords: string;
  icon: React.ReactNode;
};

const NAV_LINKS: NavLink[] = [
  {
    href: "/admin",
    label: "Overview",
    category: "Dashboard",
    hint: "Summary and quick links",
    keywords: "home dashboard start landing",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    href: "/admin/users",
    label: "Users",
    category: "People",
    hint: "Staff up top + global search — talent, clients, admins, email, phone, id",
    keywords:
      "user users people account accounts global directory lookup email phone role staff admin super agency talent client uuid login identity search",
    icon: <Search className="size-4" />,
  },
  {
    href: "/admin/talent",
    label: "Talents",
    category: "People",
    hint: "Roster, workflow, profile codes",
    keywords: "talent model host profile roster list id code uuid",
    icon: <Users className="size-4" />,
  },
  {
    href: "/admin/clients",
    label: "Clients",
    category: "People",
    hint: "Login users on the client portal — not the billing entity (use Work Locations for that)",
    keywords: "login user platform profile person display_name uuid customer client portal",
    icon: <UserRound className="size-4" />,
  },
  {
    href: "/admin/accounts",
    label: "Work Locations (billing)",
    category: "People",
    hint: "Commercial / billing entities — villa, brand, venue (not portal login users)",
    keywords: "billing entity business villa resort company commercial invoice account location",
    icon: <MapPin className="size-4" />,
  },
  {
    href: "/admin/users",
    label: "Admins & staff",
    category: "People",
    hint: "Agency staff and super admins (top of the Users page)",
    keywords: "admin staff super agency permissions user",
    icon: <Shield className="size-4" />,
  },
  {
    href: "/admin/inquiries",
    label: "Inquiries",
    category: "Bookings",
    hint: "Client requests and leads — before they become confirmed bookings",
    keywords: "inquiry lead booking request message id uuid",
    icon: <MessageSquare className="size-4" />,
  },
  {
    href: "/admin/bookings",
    label: "Bookings",
    category: "Bookings",
    hint: "Confirmed commercial jobs — lineup, pricing, payment",
    keywords: "booking job commercial revenue margin payment lineup",
    icon: <CalendarRange className="size-4" />,
  },
  {
    href: "/admin/media?tab=library",
    label: "Media Library",
    category: "Media",
    hint: "Browse recently approved uploads",
    keywords: "photo image video asset gallery approved portfolio",
    icon: <LayoutGrid className="size-4" aria-hidden />,
  },
  {
    href: "/admin/media",
    label: "Pending Approvals",
    category: "Media",
    hint: "Moderation queue for new uploads",
    keywords: "photo image video asset moderation pending review",
    icon: <ShieldCheck className="size-4" aria-hidden />,
  },
  {
    href: "/admin/fields",
    label: "Fields",
    category: "Directory / Talent Data",
    hint: "Profile field catalog",
    keywords: "schema form custom attribute definition",
    icon: <FolderTree className="size-4" />,
  },
  {
    href: "/admin/directory/filters",
    label: "Directory filters",
    category: "Directory / Talent Data",
    hint: "Public directory sidebar — order, show/hide, search-within-filters",
    keywords: "facet sidebar filter funnel directory discover public",
    icon: <ListFilter className="size-4" />,
  },
  {
    href: "/admin/taxonomy",
    label: "Taxonomy",
    category: "Directory / Talent Data",
    hint: "Tags, skills, languages, filters, categories",
    keywords: "category tag type facet filter language skill",
    icon: <Sparkles className="size-4" />,
  },
  {
    href: "/admin/locations",
    label: "Locations",
    category: "Directory / Talent Data",
    hint: "Cities and regions",
    keywords: "city country region place geography",
    icon: <MapPin className="size-4" />,
  },
  {
    href: "/admin/site-settings/structure",
    label: "Open composer",
    category: "Site",
    hint: "Homepage structure — drag, drop, draft, publish",
    keywords: "composer builder structure homepage compose sections hero layout page draft publish",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    href: "/admin/site-settings/design",
    label: "Design tokens",
    category: "Site",
    hint: "Theme presets, colors, type, spacing",
    keywords: "theme tokens color typography design preset brand style",
    icon: <Sparkles className="size-4" />,
  },
  {
    href: "/admin/site-settings/sections",
    label: "Sections library",
    category: "Site",
    hint: "Reusable content blocks (hero, CTA, gallery)",
    keywords: "sections blocks reusable content library gallery hero cta",
    icon: <LayoutGrid className="size-4" />,
  },
  {
    href: "/admin/site-settings/content/pages",
    label: "Pages",
    category: "Site",
    hint: "Non-homepage pages — about, services, journal",
    keywords: "pages non homepage content editor route",
    icon: <FolderTree className="size-4" />,
  },
  {
    href: "/admin/site-settings",
    label: "Site Settings (overview)",
    category: "Site",
    hint: "CMS hub — content, SEO, structure",
    keywords: "cms pages posts redirects navigation seo sitemap site content",
    icon: <Globe className="size-4" />,
  },
  {
    href: "/admin/site/setup",
    label: "Site Setup",
    category: "Site & AI",
    hint: "Six-step walkthrough: homepage, pages, posts, nav, theme, SEO",
    keywords: "setup hub onboarding theme kit gallery walkthrough launch live",
    icon: <Wand2 className="size-4" />,
  },
  {
    href: "/admin/ai-workspace",
    label: "AI Workspace",
    category: "Site & AI",
    hint: "Admin AI tools, logs, and rollout shells",
    keywords: "ai agent assistant embeddings search analytics",
    icon: <Sparkles className="size-4" />,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    category: "System",
    hint: "Agency and product settings",
    keywords: "config preferences options",
    icon: <Settings className="size-4" />,
  },
  {
    href: "/admin/account",
    label: "Account",
    category: "System",
    hint: "Your staff profile",
    keywords: "me personal profile password",
    icon: <Settings className="size-4" />,
  },
];

const emptyRemote: AdminSearchResponse = {
  talent: [],
  inquiries: [],
  clients: [],
  accounts: [],
};

function formatAppRole(role: string): string {
  if (role === "super_admin") return "Super admin";
  if (role === "agency_staff") return "Agency staff";
  if (role === "talent") return "Talent (login)";
  return role.replace(/_/g, " ");
}

function accountHref(a: AdminSearchResponse["accounts"][number]): string {
  if (a.talent_profile_id) return `/admin/talent/${a.talent_profile_id}`;
  return `/admin/users?q=${encodeURIComponent(a.id)}`;
}

function AccountSearchIcon({ appRole }: { appRole: string }) {
  if (appRole === "talent") {
    return <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
  if (appRole === "agency_staff" || appRole === "super_admin") {
    return <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
  return <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function shortId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function AdminCommandPalette({
  variant = "strip",
}: {
  /** `strip` = compact (legacy workspace strip). `header` = top bar — larger, admin tokens, AI affordance. */
  variant?: "strip" | "header";
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<AdminSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setRemote(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) {
            setRemote(emptyRemote);
            return;
          }
          const data = (await r.json()) as AdminSearchResponse | { error?: string };
          if ("error" in data && data.error) {
            setRemote(emptyRemote);
            return;
          }
          setRemote(data as AdminSearchResponse);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setRemote(emptyRemote);
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const navigate = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [router, handleOpenChange],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={cn(
          "inline-flex w-full items-center gap-2 border px-3 text-left text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2",
          variant === "header"
            ? "min-h-12 max-w-none rounded-xl border-[var(--admin-gold-border)]/50 bg-[var(--admin-workspace-surface)] py-2.5 pl-3 pr-2 text-[var(--admin-workspace-fg)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]/25 hover:border-[var(--admin-gold-border)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-workspace-fg)] focus-visible:ring-[var(--admin-gold)]/35"
            : "h-9 max-w-[220px] rounded-full border-border/60 bg-muted/25 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground focus-visible:ring-[var(--impronta-gold)]/40",
        )}
      >
        {variant === "header" ? (
          <Sparkles className="size-4 shrink-0 text-[var(--admin-gold)] opacity-90" aria-hidden />
        ) : null}
        <Search className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">
          {variant === "header" ? "Search anything…" : "Search…"}
        </span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
        <span className="sr-only">Opens search. Keyboard shortcut: Command K or Control K.</span>
      </button>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-[101] w-[min(100%-1.5rem,520px)] -translate-x-1/2 rounded-xl border border-border/60 bg-card shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Admin search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Filter pages or type at least two characters to search records. Results are grouped by category;
            choose a row to open it.
          </DialogPrimitive.Description>
          <Command className="rounded-xl border-0 bg-transparent shadow-none">
            <CommandInput
              placeholder="Pages, records, names, codes, or UUID…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading
                  ? "Searching…"
                  : query.trim().length < 2
                    ? "Type at least 2 characters to search records, or pick a page below."
                    : "No matches. Try another spelling, id fragment, or page name."}
              </CommandEmpty>

              <CommandGroup heading="Pages">
                {NAV_LINKS.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`page ${item.label} ${item.href} ${item.category} ${item.hint} ${item.keywords}`}
                    onSelect={() => navigate(item.href)}
                    className="items-start gap-2 py-2.5"
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight">{item.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                        <span className="text-foreground/70">{item.category}</span>
                        <span className="text-muted-foreground"> · </span>
                        {item.hint}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>

              {remote && remote.talent.length > 0 ? (
                <CommandGroup heading="Talent profiles">
                  {remote.talent.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`talent record ${t.profile_code} ${t.display_name ?? ""} ${t.id} profile code uuid`}
                      onSelect={() => navigate(`/admin/talent/${t.id}`)}
                      className="items-start gap-2 py-2.5"
                    >
                      <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate leading-tight">
                          <span className="font-medium">{t.display_name ?? "Unnamed"}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{t.profile_code}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Talent · <span className="font-mono">{shortId(t.id)}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {remote && remote.accounts.length > 0 ? (
                <CommandGroup heading="Accounts (non-client)">
                  {remote.accounts.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={`account user profile ${a.display_name ?? ""} ${formatAppRole(a.app_role)} ${a.id} uuid login staff`}
                      onSelect={() => navigate(accountHref(a))}
                      className="items-start gap-2 py-2.5"
                    >
                      <AccountSearchIcon appRole={a.app_role} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium leading-tight">{a.display_name ?? "Unnamed"}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatAppRole(a.app_role)} · <span className="font-mono">{shortId(a.id)}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {remote && remote.inquiries.length > 0 ? (
                <CommandGroup heading="Inquiries">
                  {remote.inquiries.map((i) => (
                    <CommandItem
                      key={i.id}
                      value={`inquiry lead ${i.contact_name ?? ""} ${i.company ?? ""} ${i.id} uuid`}
                      onSelect={() => navigate(`/admin/inquiries/${i.id}`)}
                      className="items-start gap-2 py-2.5"
                    >
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium leading-tight">{i.contact_name ?? "Inquiry"}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {i.company ? `${i.company} · ` : null}
                          <span className="font-mono">Inquiry {shortId(i.id)}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {remote && remote.clients.length > 0 ? (
                <CommandGroup heading="Clients (logins)">
                  {remote.clients.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`platform client login user ${c.display_name ?? ""} ${c.id} uuid portal`}
                      onSelect={() => navigate(`/admin/clients/${c.id}`)}
                      className="items-start gap-2 py-2.5"
                    >
                      <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium leading-tight">{c.display_name ?? "Client"}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Login user · <span className="font-mono">{shortId(c.id)}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
