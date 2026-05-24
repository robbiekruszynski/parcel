-- 004_parcels_extended.sql
-- Extends the existing parcels table for client-side territory claims.
-- Adds: color, points, coordinates (jsonb), area_sqm
-- Makes: activity default to 'walking', polygon nullable
-- Adds: auto-polygon trigger (builds PostGIS geography from jsonb coords)
-- Adds: RLS policies

-- ─── Column additions ──────────────────────────────────────────────────────

alter table public.parcels
  add column if not exists color     text    not null default '#f5c518',
  add column if not exists points    integer not null default 0,
  add column if not exists coordinates jsonb,
  add column if not exists area_sqm  float;

-- activity had no default — most client inserts won't bother specifying it
alter table public.parcels
  alter column activity set default 'walking';

-- Allow polygon to be null so clients can insert via coordinates jsonb alone.
-- Generated columns (area_km2, tier, pts_per_minute) will be NULL until the
-- trigger back-fills the geography value.
alter table public.parcels
  alter column polygon drop not null;

-- ─── Trigger: auto-compute PostGIS polygon from jsonb coordinates ───────────
-- coordinates stored as [[lat, lng], [lat, lng], ...]  (per prompt spec)
-- PostGIS WKT expects   (lng lat, lng lat, ...)

create or replace function public.parcels_compute_polygon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ring_pts text;
  close_pt text;
begin
  -- Only run when coordinates supplied and polygon is missing
  if NEW.coordinates is null or jsonb_array_length(NEW.coordinates) < 4 then
    return NEW;
  end if;

  if NEW.polygon is not null then
    return NEW;
  end if;

  -- Build "lng lat" pairs from [[lat,lng],...] jsonb
  select string_agg(
    (elem ->> 1) || ' ' || (elem ->> 0),  -- lng first, then lat (WKT order)
    ', '
    order by ordinality
  )
  into ring_pts
  from jsonb_array_elements(NEW.coordinates)
    with ordinality as t(elem, ordinality);

  -- Closing point = first coordinate
  close_pt := (NEW.coordinates -> 0 ->> 1) || ' ' || (NEW.coordinates -> 0 ->> 0);

  begin
    NEW.polygon := ST_GeogFromText(
      'SRID=4326;POLYGON((' || ring_pts || ', ' || close_pt || '))'
    );
  exception when others then
    -- Bad geometry — leave polygon null, don't block the insert
    null;
  end;

  return NEW;
end;
$$;

drop trigger if exists parcels_auto_polygon on public.parcels;
create trigger parcels_auto_polygon
  before insert or update of coordinates
  on public.parcels
  for each row
  execute function public.parcels_compute_polygon();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.parcels enable row level security;

drop policy if exists "parcels_select_all"   on public.parcels;
drop policy if exists "parcels_insert_own"   on public.parcels;
drop policy if exists "parcels_update_own"   on public.parcels;
drop policy if exists "parcels_delete_own"   on public.parcels;

-- Everyone can see all parcels (needed to render other players' territory)
create policy "parcels_select_all"
  on public.parcels for select
  to authenticated
  using (true);

-- Only the owner can insert
create policy "parcels_insert_own"
  on public.parcels for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- Only the owner can update their parcel (e.g. rename, recolor)
create policy "parcels_update_own"
  on public.parcels for update
  to authenticated
  using (auth.uid() = owner_id);

-- Only the owner can delete
create policy "parcels_delete_own"
  on public.parcels for delete
  to authenticated
  using (auth.uid() = owner_id);

-- ─── Index on new column ───────────────────────────────────────────────────

create index if not exists parcels_owner_id_idx on public.parcels (owner_id);
create index if not exists parcels_claimed_at_idx on public.parcels (claimed_at desc);
