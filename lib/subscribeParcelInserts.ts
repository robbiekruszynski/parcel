/**
 * Single global Supabase subscription for new parcels.
 * Avoids "cannot add postgres_changes after subscribe()" when screens remount.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useParcelStore, type Parcel } from '@/stores/parcelStore';

import { rowToParcel, type ParcelRow } from '@/lib/parcelRow';

let channel: RealtimeChannel | null = null;
let refCount = 0;

export function subscribeParcelInserts(): () => void {
  refCount += 1;

  if (!channel) {
    channel = supabase
      .channel(`parcels-global-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'parcels' },
        async (payload) => {
          const newRow = payload.new as Partial<ParcelRow>;
          if (!newRow.id) return;

          const { data } = await supabase
            .from('parcels')
            .select(`
              id, owner_id, co_owner_id, co_owners, group_id, coordinates, route_coordinates,
              area_sqm, claimed_at, color, points, activity,
              profiles ( username, display_name ),
              groups ( name )
            `)
            .eq('id', newRow.id)
            .single();

          if (data) {
            useParcelStore.getState().addParcel(rowToParcel(data as unknown as ParcelRow));
          }
        }
      )
      .subscribe();
  }

  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
