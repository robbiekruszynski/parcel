-- 008_route_replay.sql
-- Adds route_coordinates to parcels so the walked GPS trail can be replayed
-- from the parcel detail screen independently of the session.
--
-- Stored as [[lat, lng], ...] jsonb — same convention as `coordinates` (the polygon).
-- The client writes a Douglas-Peucker simplified version of the route at claim time
-- to keep row size reasonable (~100-300 points for a typical walk).

alter table public.parcels
  add column if not exists route_coordinates jsonb;

-- No index needed — only accessed by parcel ID lookup.
