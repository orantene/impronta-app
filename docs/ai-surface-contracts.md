# AI surface contracts (canonical, Phase 8.7)

Single doc for routes, components, `attach_point_key`, lifecycle, and role × capability. Do not fork parallel “surfaces” docs.

## Customer surfaces

| Surface | `attach_point_key` | Placement | Lifecycle default |
|---------|-------------------|-----------|-------------------|
| AI search entry | `directory.search_input` | Directory search UX | placeholder |
| Match explanation | `directory.result_explanation` | Card / row | hidden → beta |
| Refine strip | `directory.refine_suggestions` | Above grid | hidden → beta |
| Shortlist assistant | `shortlist.panel` | Drawer | placeholder |
| Inquiry assistant | `inquiry.inline` | Near message field | placeholder |
| Find similar | `profile.find_similar` | Profile | hidden |
| Brief builder | `directory.brief` | Optional modal | hidden |

## Admin surfaces

| Surface | `attach_point_key` | Placement |
|---------|-------------------|-----------|
| AI Workspace | `admin.ai_workspace` | `/admin/ai-workspace` |
| Talent edit panel | `admin.talent.ai_panel` | Right rail / panel |
| Inquiry detail | `admin.inquiry.ai_panel` | Detail drawer |
| Site Settings AI | `admin.site_settings.ai` | System → AI (8.6) |

## Role × capability (summary)

| Capability | Guest | Client | Staff | Super |
|------------|-------|--------|-------|-------|
| Search AI | if flags | if flags | if flags | if flags |
| Explanations | if flags | if flags | if flags | if flags + debug |
| Draft inquiry | if flags | if flags | N/A | N/A |
| Admin tools | — | — | read/draft | + restricted write |

Detail in `agent-permissions.md` and `ai-settings-model.md`.

## Component mapping

See `ai-component-system.md` for `AIPanel`, `AIMatchExplanation`, `AISuggestionChips`, `AIErrorBoundary`, etc.
