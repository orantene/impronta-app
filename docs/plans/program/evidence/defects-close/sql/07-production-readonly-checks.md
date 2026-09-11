# production pluhdapdnuiulvxmyspd, read_only:true via management API, 2026-09-11
## functions present of the five asked
201 [{"proname":"complete_client_onboarding"},{"proname":"complete_talent_onboarding"},{"proname":"complete_talent_onboarding_with_locations"},{"proname":"handle_new_user"},{"proname":"is_agency_staff"}]
## non-internal triggers on public.profiles
201 []
## profiles column defaults
201 [{"column_name":"account_status","is_nullable":"NO","column_default":"'registered'::account_status"},{"column_name":"app_role","is_nullable":"NO","column_default":"'client'::app_role"},{"column_name":"onboarding_completed_at","is_nullable":"YES","column_default":null}]
## ledger rows for the two auth migrations
201 [{"version":"20260408113000","name":"admin_bootstrap_and_profile_guard"},{"version":"20260408150000","name":"auth_dashboard_routing_contract_fix"}]
## account_status x app_role
201 [{"account_status":"onboarding","app_role":"client","count":17},{"account_status":"active","app_role":"talent","count":7},{"account_status":"active","app_role":"client","count":6},{"account_status":"active","app_role":"agency_staff","count":2},{"account_status":"onboarding","app_role":"talent","count":1},{"account_status":"active","app_role":"super_admin","count":1}]
## the four archive/System A tables
201 [{"fd":null,"fv":null,"fda":null,"fva":null}]
## product_tiers names
201 [{"slug":"agency","name":"Business"},{"slug":"studio","name":"Team"},{"slug":"website","name":"Site"}]
