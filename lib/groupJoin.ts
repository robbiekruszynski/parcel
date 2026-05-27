import { supabase } from '@/lib/supabase';

export interface GroupLookup {
  id: string;
  name: string;
  invite_code: string;
}

export interface GroupJoinPreview extends GroupLookup {
  memberCount: number;
  creatorUsername: string | null;
}

export async function fetchGroupJoinPreview(groupId: string): Promise<GroupJoinPreview> {
  const { data: group, error } = await supabase
    .from('groups')
    .select('id, name, invite_code, created_by')
    .eq('id', groupId)
    .single();

  if (error || !group) throw new Error('Group not found.');

  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId);

  let creatorUsername: string | null = null;
  if (group.created_by) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', group.created_by)
      .single();
    creatorUsername = profile?.username ?? null;
  }

  return {
    id: group.id,
    name: group.name,
    invite_code: group.invite_code,
    memberCount: count ?? 0,
    creatorUsername,
  };
}

export async function lookupGroupByCode(code: string): Promise<GroupJoinPreview> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== 6) {
    throw new Error('Enter a 6-character invite code.');
  }

  const { data: group, error } = await supabase
    .from('groups')
    .select('id, name, invite_code')
    .eq('invite_code', normalized)
    .single();

  if (error || !group) throw new Error('No group found with that code.');
  return fetchGroupJoinPreview(group.id);
}

export async function ensureGroupMembershipLimit(userId: string): Promise<void> {
  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 3) {
    throw new Error('You can be in up to 3 groups at a time. Leave a group first.');
  }
}

export async function acceptGroupMembership(
  userId: string,
  groupId: string,
  inviteId?: string,
): Promise<void> {
  await ensureGroupMembershipLimit(userId);

  const { data: existing } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) throw new Error("You're already in this group.");

  const { error: insertError } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role: 'member' });

  if (insertError && !insertError.message.includes('duplicate')) {
    throw new Error(insertError.message);
  }

  if (inviteId) {
    await supabase.from('group_invites').update({ status: 'accepted' }).eq('id', inviteId);
  }
}

export async function declineGroupInvite(inviteId: string): Promise<void> {
  await supabase.from('group_invites').update({ status: 'declined' }).eq('id', inviteId);
}

export function buildGroupJoinDeepLink(code: string): string {
  return `parcel://join?code=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function parseGroupJoinDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'parcel:') return null;
    const path = parsed.pathname.replace(/^\//, '') || parsed.hostname;
    if (path !== 'join' && !url.includes('join')) return null;
    const code = parsed.searchParams.get('code');
    return code?.trim().toUpperCase().slice(0, 6) ?? null;
  } catch {
    return null;
  }
}
