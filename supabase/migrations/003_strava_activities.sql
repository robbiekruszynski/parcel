create table if not exists public.strava_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  strava_activity_id bigint unique not null,
  sport_type text,
  start_date timestamptz,
  distance_meters float,
  moving_time_seconds int,
  route_latlng jsonb,
  territory_hits jsonb default '[]'::jsonb,
  processed boolean default false,
  processed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.strava_activities enable row level security;

drop policy if exists "Users can view own activities" on public.strava_activities;
create policy "Users can view own activities"
  on public.strava_activities
  for select
  using (auth.uid() = user_id);

create index if not exists strava_activities_user_id_idx on public.strava_activities(user_id);
create index if not exists strava_activities_processed_idx
  on public.strava_activities(processed)
  where processed = false;
