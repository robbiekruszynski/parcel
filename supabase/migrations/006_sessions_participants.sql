-- 006_sessions_participants.sql
-- Session-scoped tracking, participants for point splits, locations tied to sessions.

-- ─── Locations: tie GPS samples to a session ─────────────────────────────────

alter table public.locations
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists locations_session_id_idx on public.locations (session_id);

-- ─── Parcels: ensure session_id column exists ───────────────────────────────

alter table public.parcels
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists parcels_session_id_idx on public.parcels (session_id);

-- ─── Session participants (explicit paired / solo session members) ──────────

create table if not exists public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.session_participants enable row level security;

drop policy if exists "session_participants_select" on public.session_participants;
create policy "session_participants_select"
  on public.session_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

drop policy if exists "session_participants_insert_own_session" on public.session_participants;
create policy "session_participants_insert_own_session"
  on public.session_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "session_participants_insert_partner" on public.session_participants;
create policy "session_participants_insert_partner"
  on public.session_participants for insert
  to authenticated
  with check (user_id = auth.uid());

-- ─── Points credit RPC (used on parcel claim) ─────────────────────────────────

create or replace function public.credit_parcel_points(p_uid uuid, p_points integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_points is null or p_points < 1 then
    return;
  end if;
  update public.profiles
  set
    points_total   = coalesce(points_total, 0) + p_points,
    points_balance = coalesce(points_balance, 0) + p_points
  where id = p_uid;
end;
$$;

grant execute on function public.credit_parcel_points(uuid, integer) to authenticated;

-- ─── Sessions RLS (client creates session rows on START PARCEL) ───────────────

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update
  to authenticated
  using (user_id = auth.uid());
