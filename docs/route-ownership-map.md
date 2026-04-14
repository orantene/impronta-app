# Route ownership map (Phase 8.5)

| Route pattern | Layout owner | Content owner | Metadata owner | Operational vs CMS | AI attach (future) |
|---------------|--------------|---------------|----------------|--------------------|---------------------|
| `/` | App | Marketing / CMS | CMS + defaults | Mixed | — |
| `/directory`, `/models/*` | App | Directory feature | App | **Operational** | Search, refine, explain |
| `/t/[profileCode]` | App | Talent profile | App + talent | **Operational** | Similar, explain |
| `/login`, `/register` | App | App copy | App | — | — |
| `/admin/*` | Dashboard shell | Feature folders | App | — | Workspace, embedded panels |
| `/admin/site-settings/*` | Dashboard | Site Settings (8.6) | CMS | **CMS** | Content agent (later) |
| `/admin/ai-workspace` | Dashboard | AI shell | App | — | All admin agents |

Update this table when adding routes.
