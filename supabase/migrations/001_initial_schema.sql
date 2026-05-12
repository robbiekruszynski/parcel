-- Parcel core schema (PostGIS). Apply via Supabase SQL editor or `supabase db push`.

create extension if not exists postgis;

create table public.profiles (
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

create table public.sessions (
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

create table public.parcels (
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

create index parcels_polygon_idx on public.parcels using gist (polygon);

create table public.points_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles not null,
  parcel_id uuid references public.parcels,
  amount integer not null,
  reason text not null,
  created_at timestamptz default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  treasury_points integer default 0,
  created_by uuid references public.profiles,
  created_at timestamptz default now()
);

create table public.group_members (
  group_id uuid references public.groups not null,
  user_id uuid references public.profiles not null,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table public.group_proposals (
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

create table public.proposal_votes (
  proposal_id uuid references public.group_proposals not null,
  user_id uuid references public.profiles not null,
  vote boolean not null,
  created_at timestamptz default now(),
  primary key (proposal_id, user_id)
);

create table public.owned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles not null,
  item_type text not null,
  item_id text not null,
  purchased_at timestamptz default now()
);
