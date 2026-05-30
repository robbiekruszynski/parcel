-- 007_pair_requests.sql
-- Cooperative-pairing request handshake table.
-- Allows users to send/accept/decline pair invitations in real-time.

create table if not exists public.pair_requests (
  id            uuid        primary key default gen_random_uuid(),
  from_user_id  uuid        not null references auth.users(id) on delete cascade,
  to_user_id    uuid        not null references auth.users(id) on delete cascade,
  status        text        not null default 'pending'
                            check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '10 minutes')
);

alter table public.pair_requests enable row level security;

-- Sender can create requests
drop policy if exists "pair_requests_insert_own" on public.pair_requests;
create policy "pair_requests_insert_own"
  on public.pair_requests for insert
  to authenticated
  with check (from_user_id = auth.uid());

-- Both parties can read their own requests
drop policy if exists "pair_requests_select_parties" on public.pair_requests;
create policy "pair_requests_select_parties"
  on public.pair_requests for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- Recipient can accept/decline; sender can cancel (set to declined)
drop policy if exists "pair_requests_update_parties" on public.pair_requests;
create policy "pair_requests_update_parties"
  on public.pair_requests for update
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- Real-time so recipient gets instant notification
-- Wrapped in a DO block so it's a no-op if the table is already in the publication.
do $$
begin
  alter publication supabase_realtime add table public.pair_requests;
exception
  when duplicate_object then null;
end $$;
