import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { TerritoryPolygonJson } from '@/lib/territory';

type TerritoryRow = {
  id: string;
  user_id: string;
  polygon: TerritoryPolygonJson;
  area_m2: number;
  claimed_at: string;
};

function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2)} m²`;
}

export default function TerritoryScreen() {
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('territories')
      .select('id, user_id, polygon, area_m2, claimed_at')
      .order('area_m2', { ascending: false });

    if (error) {
      if (__DEV__) console.warn('[territory]', error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as TerritoryRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, [load]);

  if (loading && rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-parcel-bg-light dark:bg-parcel-bg-dark">
        <ActivityIndicator color="#f5c842" />
        <Text className="mt-3 text-white/60">Loading territories…</Text>
      </View>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <View className="flex-1 items-center justify-center bg-parcel-bg-light px-8 dark:bg-parcel-bg-dark">
        <Text className="text-center text-lg font-semibold text-parcel-bg-dark dark:text-white">
          Supabase not configured
        </Text>
        <Text className="mt-3 text-center text-base leading-6 text-parcel-bg-dark/70 dark:text-white/55">
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file, then restart
          Expo with a cleared cache.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-parcel-bg-light dark:bg-parcel-bg-dark">
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshing={loading}
        onRefresh={() => void load()}
        ListEmptyComponent={
          <Text className="py-10 text-center text-white/50">
            No territories yet. Claim a loop on the Map tab.
          </Text>
        }
        renderItem={({ item, index }) => {
          const mine = userId != null && item.user_id === userId;
          const claimed = new Date(item.claimed_at).toLocaleString();

          return (
            <View
              className={`mb-3 rounded-2xl border px-4 py-4 ${
                mine ? 'border-parcel-gold bg-parcel-gold/15' : 'border-white/10 bg-white/5 dark:bg-white/5'
              }`}>
              <View className="flex-row items-baseline justify-between">
                <Text className="text-2xl font-bold text-parcel-bg-dark dark:text-white">#{index + 1}</Text>
                <Text className="font-mono text-parcel-gold">{formatArea(item.area_m2)}</Text>
              </View>
              <Text className="mt-2 text-xs uppercase tracking-wider text-parcel-bg-dark/50 dark:text-white/40">
                claimed {claimed}
              </Text>
              {mine && (
                <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-parcel-gold">Your parcel</Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
