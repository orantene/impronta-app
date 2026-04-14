# Audit events (Phase 8.5–8.6)

## Goal

Staff-visible history for: title, slug, meta, template, theme tokens, redirects, feature flags, critical settings.

## Options

1. Extend existing `activity_log` if fit-for-purpose.  
2. Add `content_settings_audit` (or similar) with actor, entity, action, payload summary, `created_at`.

Schema choice → `decision-log.md`. **PII:** redact in UI; retention policy TBD.
