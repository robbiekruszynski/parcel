-- Run this ONCE in Supabase Dashboard → SQL Editor
-- when your database already has the schema but migration history is empty/out of sync.
--
-- Marks migrations 001–005 as applied (does not run their SQL again).
-- Then run locally:  supabase db push
-- (should only apply 006_sessions_participants.sql)

-- Optional: remove a failed/partial row from a aborted db push
-- delete from supabase_migrations.schema_migrations where version = '001_initial_schema';

insert into supabase_migrations.schema_migrations (version, name)
values
  ('001_initial_schema',     '001_initial_schema'),
  ('001_realtime_tracking',  '001_realtime_tracking'),
  ('002_strava_connections', '002_strava_connections'),
  ('003_strava_activities',  '003_strava_activities'),
  ('004_parcels_extended',   '004_parcels_extended'),
  ('005_group_invites',      '005_group_invites')
on conflict (version) do nothing;

-- Verify:
-- select version, name from supabase_migrations.schema_migrations order by version;
