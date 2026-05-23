create table if not exists public.strava_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  strava_athlete_id bigint unique not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  athlete_firstname text,
  athlete_lastname text,
  athlete_avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.strava_connections enable row level security;

drop policy if exists "Users can manage own strava connection" on public.strava_connections;
create policy "Users can manage own strava connection"
  on public.strava_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists strava_connections_user_id_idx on public.strava_connections(user_id);
create index if not exists strava_connections_athlete_id_idx on public.strava_connections(strava_athlete_id);

create unique index if not exists strava_connections_user_id_unique on public.strava_connections(user_id);
