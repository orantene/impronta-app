-- Enable the free pgaudit extension and log DDL + role changes for the postgres role only.
-- Nothing is set on app roles (anon, authenticated, service_role).
create extension if not exists pgaudit;
alter role postgres set pgaudit.log to 'ddl,role';
