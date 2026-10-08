# Env run: Para mi, desktop (AI provider vars exported)

Stack: isolated fxlankepwnvelxjrahwk, AI provider var NAMES exported to the dev process: ANTHROPIC_API_KEY, OPENAI_API_KEY (no AI_PROVIDER or AI_CREDENTIALS_ENCRYPTION_KEY exist in .env.local). Values never recorded.
Build duration: about 8 s from step=building (01:54:57Z) to site_publish_failed (01:55:04Z); it now fails fast instead of 180 s.

```
{"ns":"impronta","event":"analytics_server_log.warn","requestId":"req-15ba15af-a6f8-40a7-9c0d-33808ebdeeea","ts":"2026-10-08T01:54:52.960Z","message":"[logAnalyticsEventServer]","error":"null value in column \"tenant_id\
 POST /api/analytics/events 200 in 245ms (next.js: 6ms, proxy.ts: 9ms, application-code: 230ms)
 POST /start?lang=es 200 in 268ms (next.js: 5ms, proxy.ts: 30ms, application-code: 233ms)
  └─ ƒ loadOnboardingResume() in 218ms src/lib/server-actions/onboarding-module.ts
 POST /start?lang=es 200 in 251ms (next.js: 6ms, proxy.ts: 7ms, application-code: 238ms)
  └─ ƒ loadOnboardingCard() in 222ms src/lib/server-actions/onboarding-module.ts
{"ns":"impronta","event":"analytics_server_log.warn","requestId":"req-ae0cedc1-8ce1-40a7-a36c-f4f8e901e2fc","ts":"2026-10-08T01:54:53.484Z","message":"[logAnalyticsEventServer]","error":"null value in column \"tenant_id\
 POST /api/analytics/events 200 in 224ms (next.js: 1612µs, proxy.ts: 3ms, application-code: 220ms)
 POST /start?lang=es 200 in 1785ms (next.js: 5ms, proxy.ts: 8ms, application-code: 1772ms)
  └─ ƒ saveOnboardingStep({"locale":"es","step":"building"}) in 1751ms src/lib/server-actions/onboarding-module.ts
{"ns":"impronta","event":"ai_schedule_rebuild_ai_search_document.info","requestId":"req-c6c8e622-0359-45de-83af-b6ff81150c9c","ts":"2026-10-08T01:54:57.664Z","message":"[ai-search] scheduled profile=8d3d5bea-22f7-48ff-92
{"ns":"impronta","event":"ai_schedule_rebuild_ai_search_document.info","requestId":"req-a5ccca8e-f4b4-4b10-bcd9-c4c53cf2cfc8","ts":"2026-10-08T01:54:58.185Z","message":"[ai-search] coalesced (already pending) profile=8d3
[talentSite.heroProofDemo] column talent_profiles.is_demo does not exist | code=42703 
[talentSite.heroProofDemo] column talent_profiles.is_demo does not exist | code=42703 
[maison.apply.readLive] column talent_sites.custom_palette does not exist | code=42703 
[onboarding.provisionForChoice.publishOwnSite] Could not read your site. Error: Could not read your site.
[onboarding.build.warnings] site:site_publish_failed Error: site:site_publish_failed
[onboarding.build.verifyLive] talent:no_url Error: talent:no_url
```

workspace:status did not appear for this choice (Para mi); it is Estudio/Ambos only.

Root cause line from the same log (just before the failure):
```
  └─ ƒ saveOnboardingStep({"locale":"es","step":"building"}) in 1751ms src/lib/server-actions/onboarding-module.ts
{"ns":"impronta","event":"ai_schedule_rebuild_ai_search_document.info","requestId":"req-c6c8e622-0359-45de-83af-b6ff81150c9c","ts":"2026-10-08T01:54:57.664Z","message":"[ai-search] scheduled profile=8
{"ns":"impronta","event":"ai_schedule_rebuild_ai_search_document.info","requestId":"req-a5ccca8e-f4b4-4b10-bcd9-c4c53cf2cfc8","ts":"2026-10-08T01:54:58.185Z","message":"[ai-search] coalesced (already 
```
