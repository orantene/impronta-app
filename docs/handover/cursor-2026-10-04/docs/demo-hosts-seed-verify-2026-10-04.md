---
cursor:
  subagentId: "bc-1cabf728-8298-588a-820d-dc99f91d7eb0"
---

# Demo hosts seed + verify — 2026-10-04

## Verdict

`maison-v2-demo.tulala.digital` is fixed (200 · Alba). All **31** published talent `{siteSlug}-demo` hosts were already live via `talent_site_subdomain_lookup` (no `agency_domains` seed). Added design vanity aliases for `maison-v2` / `folio` / `gridline` (`-demo` + bare). Migration applied to remote before PR merge.

## Why not `agency_domains`

Talent subdomain hosts resolve **after** `agency_domains` misses (`host-context.ts`). Seeding `{siteSlug}-demo` into `agency_domains` would win first and mis-route demos as agency/app hosts. Host registration for demos is the lookup RPC (#2526 + this PR).

## Inventory (expected `-demo` hosts after #2526)

| Source | Hosts |
|---|---|
| Published `talent_profiles.is_demo` + `talent_sites.site_published_at` | 31 × `{site_slug}-demo.tulala.digital` |
| Finished-gallery design vanity (new) | `maison-v2-demo`, `folio-demo`, `gridline-demo` → featured demos |
| Docs examples | alba / camila / renata (subset of the 31) |

Design → featured map: `maison-v2`→`alba-nail-artist`, `folio`→`mateo-ferrer`, `gridline`→`alex-trevino`.

## Change

- Migration `supabase/migrations/20261231345000_design_demo_host_aliases.sql` (sorted after remote tip `20261231344000` numeric_talent_profile_codes ledger row).
- Extends `talent_site_subdomain_lookup` + reserves labels in `platform_subdomain_label_taken`.
- Docs: `web/docs/talent-demo-hosts.md`.
- Static test: `web/src/lib/talent-site/design_demo_host_aliases.migration.test.ts`.

Applied remote: Supabase MCP `apply_migration` + ledger aligned to `20261231345000` / `design_demo_host_aliases` (CLI `db:push` unavailable here — no linked service-role DB password in this VM).

## Gates

- `npm run typecheck` PASS
- `npm run lint` PASS
- Focused migration test PASS (3/3)

## Verification table (live, ~2026-10-04 17:20Z)

Deploy tip: SHA `15e65e2d5091` · `dpl_3QPTZnu8gzmQHDCD3ENVPq3ZNgV5`. No Host-not-registered / Domain-not-connected on any row below.

### Design vanity (the Oran failure)

| Host | HTTP | Redirect / title | SHA |
|---|---|---|---|
| `maison-v2-demo.tulala.digital` | **200** | Alba · Tulala | `15e65e2d5091` |
| `maison-v2.tulala.digital` | **308** | → `alba-nail-artist-demo.tulala.digital` | (redirect) |
| `folio-demo.tulala.digital` | **200** | Mateo Ferrer · Tulala | `15e65e2d5091` |
| `folio.tulala.digital` | **308** | → `mateo-ferrer-demo.tulala.digital` | (redirect) |
| `gridline-demo.tulala.digital` | **200** | Alex Treviño · Tulala | `15e65e2d5091` |
| `gridline.tulala.digital` | **308** | → `alex-trevino-demo.tulala.digital` | (redirect) |

### Published talent `-demo` hosts (31/31 → 200)

| Host | HTTP | Title | SHA |
|---|---|---|---|
| `alba-nail-artist-demo.tulala.digital` | 200 | Alba · Tulala | `15e65e2d5091` |
| `alex-trevino-demo.tulala.digital` | 200 | Alex Treviño · Tulala | `15e65e2d5091` |
| `andre-castillo-demo.tulala.digital` | 200 | Andre Castillo · Tulala | `15e65e2d5091` |
| `andres-cocina-demo.tulala.digital` | 200 | Andrés Molina · Tulala | `15e65e2d5091` |
| `camila-nails-demo.tulala.digital` | 200 | Camila Rivas · Tulala | `15e65e2d5091` |
| `daniel-kim-demo.tulala.digital` | 200 | Daniel Kim · Tulala | `15e65e2d5091` |
| `diego-navarro-dj-demo.tulala.digital` | 200 | Diego Navarro · Tulala | `15e65e2d5091` |
| `elena-garza-trevino-demo.tulala.digital` | 200 | Elena Garza Treviño · Tulala | `15e65e2d5091` |
| `gary-lindqvist-demo.tulala.digital` | 200 | Gary Lindqvist · Tulala | `15e65e2d5091` |
| `grace-tanaka-demo.tulala.digital` | 200 | Grace Tanaka · Tulala | `15e65e2d5091` |
| `karla-beltran-demo.tulala.digital` | 200 | Karla Beltrán · Tulala | `15e65e2d5091` |
| `leo-haddad-demo.tulala.digital` | 200 | Leo Haddad Brows · Tulala | `15e65e2d5091` |
| `linh-tran-demo.tulala.digital` | 200 | Linh Tran · Tulala | `15e65e2d5091` |
| `lucia-herrera-demo.tulala.digital` | 200 | Lucía Herrera · Tulala | `15e65e2d5091` |
| `marcus-bell-demo.tulala.digital` | 200 | Marcus Bell · Tulala | `15e65e2d5091` |
| `mariana-merida-demo.tulala.digital` | 200 | Mariana Pech · Tulala | `15e65e2d5091` |
| `mateo-ferrer-demo.tulala.digital` | 200 | Mateo Ferrer · Tulala | `15e65e2d5091` |
| `noemi-castaneda-demo.tulala.digital` | 200 | Noemí Castañeda · Tulala | `15e65e2d5091` |
| `omar-siddiqui-demo.tulala.digital` | 200 | Omar Siddiqui · Tulala | `15e65e2d5091` |
| `pablo-entrena-demo.tulala.digital` | 200 | Pablo Serrano · Tulala | `15e65e2d5091` |
| `priya-shah-demo.tulala.digital` | 200 | Priya Shah · Tulala | `15e65e2d5091` |
| `rafael-hernandez-cuevas-demo.tulala.digital` | 200 | Rafa Cuevas · Tulala | `15e65e2d5091` |
| `ramon-gutierrez-pacheco-demo.tulala.digital` | 200 | Don Ramón Arreglos · Tulala | `15e65e2d5091` |
| `renata-lashes-demo.tulala.digital` | 200 | Renata Salgado · Tulala | `15e65e2d5091` |
| `saul-tapia-ortega-demo.tulala.digital` | 200 | Madera Tapia · Tulala | `15e65e2d5091` |
| `sofia-barra-demo.tulala.digital` | 200 | Sofía Campos · Tulala | `15e65e2d5091` |
| `sofia-rinaldi-demo.tulala.digital` | 200 | Sofía Rinaldi · Tulala | `15e65e2d5091` |
| `tamika-sutton-demo.tulala.digital` | 200 | Tamika Sutton · Tulala | `15e65e2d5091` |
| `terrence-coleman-demo.tulala.digital` | 200 | Coleman Cuts · Tulala | `15e65e2d5091` |
| `tomas-retratos-demo.tulala.digital` | 200 | Tomás Aguilar · Tulala | `15e65e2d5091` |
| `valeria-baila-demo.tulala.digital` | 200 | Valeria Ortiz · Tulala | `15e65e2d5091` |

## PR

Draft: https://github.com/orantene/impronta-app/pull/2534 · branch `cursor/demo-hosts-seed-verify-7eb0`
