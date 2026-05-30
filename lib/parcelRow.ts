import type { Parcel } from '@/stores/parcelStore';

export interface ParcelRow {
  id: string;
  owner_id: string;
  co_owner_id: string | null;
  co_owners: string[] | null;
  group_id: string | null;
  coordinates: [number, number][] | null;
  route_coordinates: [number, number][] | null;
  area_sqm: number | null;
  claimed_at: string;
  color: string | null;
  points: number | null;
  activity: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
  groups: { name: string | null } | null;
}

export function rowToParcel(row: ParcelRow): Parcel {
  return {
    id:                  row.id,
    owner_id:            row.owner_id,
    co_owner_id:         row.co_owner_id ?? null,
    co_owners:           row.co_owners ?? [],
    group_id:            row.group_id ?? null,
    group_name:          row.groups?.name ?? null,
    coordinates:         row.coordinates ?? [],
    route_coordinates:   row.route_coordinates ?? null,
    area_sqm:            row.area_sqm ?? 0,
    claimed_at:          row.claimed_at,
    color:               row.color ?? '#f5c518',
    points:              row.points ?? 0,
    activity:            row.activity ?? 'walking',
    owner_username:      row.profiles?.username ?? null,
    owner_display_name:  row.profiles?.display_name ?? null,
  };
}
