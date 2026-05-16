-- Realtime tracking MVP: live GPS pings + claimed territory polygons (GeoJSON in jsonb).
-- Runs after 001_initial_schema.sql (lexicographic: initial_* before realtime_*).

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index locations_recorded_at_idx on public.locations (recorded_at desc);
create index locations_user_id_idx on public.locations (user_id);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  polygon jsonb not null,
  area_m2 double precision not null,
  claimed_at timestamptz not null default now()
);

create index territories_user_id_idx on public.territories (user_id);
create index territories_area_m2_idx on public.territories (area_m2 desc);

alter table public.locations enable row level security;
alter table public.territories enable row level security;

create policy "locations_insert_own"
  on public.locations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "locations_select_authenticated"
  on public.locations
  for select
  to authenticated
  using (true);

create policy "territories_insert_own"
  on public.territories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "territories_select_own"
  on public.territories
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Broadcast inserts to Realtime clients (idempotent add may error if already present — safe to ignore).
alter publication supabase_realtime add table public.locations;
