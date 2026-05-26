-- ─── 005_group_invites.sql ────────────────────────────────────────────────────
-- Adds a group_invites table so members can receive and accept/decline
-- group invitations instead of being silently added to group_members.
-- Real-time is enabled so the invitee gets an instant notification.

create table if not exists public.group_invites (
  id            uuid        primary key default gen_random_uuid(),
  group_id      uuid        not null references public.groups(id) on delete cascade,
  from_user_id  uuid        not null references auth.users(id) on delete cascade,
  to_user_id    uuid        not null references auth.users(id) on delete cascade,
  group_name    text        not null default '',
  status        text        not null default 'pending'
                            check (status in ('pending','accepted','declined')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '72 hours'),
  unique(group_id, to_user_id)
);

-- Row-level security ─────────────────────────────────────────────────────────
alter table public.group_invites enable row level security;

-- Inviter can insert
create policy "group_invites_inviter_insert"
  on public.group_invites for insert
  with check (from_user_id = auth.uid());

-- Both parties can read their own invites
create policy "group_invites_parties_select"
  on public.group_invites for select
  using (to_user_id = auth.uid() or from_user_id = auth.uid());

-- Invitee can accept or decline
create policy "group_invites_invitee_update"
  on public.group_invites for update
  using (to_user_id = auth.uid());

-- Inviter can cancel (delete)
create policy "group_invites_inviter_delete"
  on public.group_invites for delete
  using (from_user_id = auth.uid());

-- Enable real-time delivery to the invitee's device
alter publication supabase_realtime add table public.group_invites;
