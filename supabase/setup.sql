create extension if not exists postgis;

create table if not exists public.profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  trail_color text default '#00c8ff',
  trail_style text default 'solid',
  territory_fill text default '#f5c842',
  points_total integer default 0,
  points_balance integer default 0,
  streak_days integer default 0,
  last_active_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles not null,
  activity text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  distance_meters numeric,
  avg_speed_kmh numeric,
  calories integer,
  raw_path geography(LineString, 4326),
  simplified_path geography(LineString, 4326),
  created_at timestamptz default now()
);

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles not null,
  session_id uuid references public.sessions,
  activity text not null,
  polygon geography(Polygon, 4326) not null,
  area_km2 numeric generated always as (
    ST_Area(polygon::geography) / 1000000
  ) stored,
  tier text generated always as (
    case
      when ST_Area(polygon::geography) / 1000000 < 0.1 then 'micro'
      when ST_Area(polygon::geography) / 1000000 < 0.5 then 'block'
      when ST_Area(polygon::geography) / 1000000 < 2 then 'district'
      when ST_Area(polygon::geography) / 1000000 < 10 then 'zone'
      else 'landmark'
    end
  ) stored,
  pts_per_minute integer generated always as (
    case
      when ST_Area(polygon::geography) / 1000000 < 0.1 then 1
      when ST_Area(polygon::geography) / 1000000 < 0.5 then 3
      when ST_Area(polygon::geography) / 1000000 < 2 then 8
      when ST_Area(polygon::geography) / 1000000 < 10 then 20
      else 50
    end
  ) stored,
  claimed_at timestamptz default now(),
  grace_until timestamptz,
  is_vulnerable boolean default false,
  custom_name text,
  created_at timestamptz default now()
);

create index if not exists parcels_polygon_idx on public.parcels using gist (polygon);

create table if not exists public.points_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles not null,
  parcel_id uuid references public.parcels,
  amount integer not null,
  reason text not null,
  created_at timestamptz default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  treasury_points integer default 0,
  created_by uuid references public.profiles,
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id uuid references public.groups not null,
  user_id uuid references public.profiles not null,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups not null,
  proposed_by uuid references public.profiles not null,
  title text not null,
  description text,
  points_cost integer not null,
  spend_type text not null,
  status text default 'open',
  votes_yes integer default 0,
  votes_no integer default 0,
  closes_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists public.proposal_votes (
  proposal_id uuid references public.group_proposals not null,
  user_id uuid references public.profiles not null,
  vote boolean not null,
  created_at timestamptz default now(),
  primary key (proposal_id, user_id)
);

create table if not exists public.owned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles not null,
  item_type text not null,
  item_id text not null,
  purchased_at timestamptz default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index if not exists locations_recorded_at_idx on public.locations (recorded_at desc);
create index if not exists locations_user_id_idx on public.locations (user_id);

create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  polygon jsonb not null,
  area_m2 double precision not null,
  claimed_at timestamptz not null default now()
);

create index if not exists territories_user_id_idx on public.territories (user_id);
create index if not exists territories_area_m2_idx on public.territories (area_m2 desc);

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.territories enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "locations_insert_own" on public.locations;
create policy "locations_insert_own"
  on public.locations for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "locations_select_authenticated" on public.locations;
create policy "locations_select_authenticated"
  on public.locations for select to authenticated using (true);

drop policy if exists "territories_insert_own" on public.territories;
create policy "territories_insert_own"
  on public.territories for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "territories_select_authenticated" on public.territories;
create policy "territories_select_authenticated"
  on public.territories for select to authenticated using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text;
  final_username text;
begin
  raw_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if raw_username = '' or raw_username !~ '^[a-z0-9_]{3,24}$' then
    raw_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  final_username := raw_username;

  while exists (select 1 from public.profiles where username = final_username) loop
    final_username := raw_username || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    final_username,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
begin
  alter publication supabase_realtime add table public.locations;
exception
  when duplicate_object then null;
end $$;

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
