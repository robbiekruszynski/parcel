/**
 * ParcelRecordingOverlay.tsx
 *
 * Floating UI overlay rendered on top of the map during a parcel recording
 * session. Shows:
 *  - "START PARCEL" button when idle
 *  - Live distance while recording
 *  - Loop-closed area + "CLAIM PARCEL" button when the loop closes
 *  - PAUSE / RESUME / END SESSION controls
 *
 * Wire up with useParcelTracking — pass the returned values straight through.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatAreaM2, formatDistanceM } from '@/lib/parcelGeometry';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ParcelRecordingOverlayProps {
  isTracking: boolean;
  isPaused: boolean;
  loopClosed: boolean;
  distanceM: number;
  areaM2: number | null;

  /** Confirmed partners — shows a partner-list badge. */
  partners?: { id: string; username: string | null }[];
  /** Called when user taps the PAIR button to open the partner-search modal. */
  onPairPress?: () => void;

  onStart: () => Promise<void> | void;
  onPause: () => void;
  onResume: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  onClaim: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER    = '#f5c518';
const CARD_BG  = '#13131a';
const FONT     = 'Rajdhani_600SemiBold';
const FONT_BIG = 'BarlowCondensed_900Black';

// ─── Component ────────────────────────────────────────────────────────────────

export function ParcelRecordingOverlay({
  isTracking,
  isPaused,
  loopClosed,
  distanceM,
  areaM2,
  partners = [],
  onPairPress,
  onStart,
  onPause,
  onResume,
  onStop,
  onClaim,
}: ParcelRecordingOverlayProps) {
  const insets      = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const bottomOffset = insets.bottom + 108; // above the NavSheet handle

  // ── Idle: show "START PARCEL" ────────────────────────────────────────────
  if (!isTracking && !isPaused) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}>
        <Pressable
          onPress={() => void onStart()}
          style={{
            backgroundColor: AMBER,
            paddingVertical: 17,
            paddingHorizontal: 48,
            borderRadius: 999,
            shadowColor: AMBER,
            shadowOpacity: 0.55,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 4 },
            elevation: 14,
          }}>
          <Text
            style={{
              fontFamily: FONT,
              fontSize: 17,
              fontWeight: '700',
              color: '#0e0e10',
              letterSpacing: 1.5,
            }}>
            START PARCEL
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Active / Paused: full recording card ─────────────────────────────────
  const handleClaim = async () => {
    setBusy(true);
    try {
      await onClaim();
      const partySize = 1 + partners.length;
      const fullPts = areaM2 != null ? Math.max(1, Math.round(areaM2 / 50)) : null;
      const eachPts = fullPts != null ? Math.max(1, Math.floor(fullPts / partySize)) : null;
      const splitNote = partySize > 1 ? ` (split ${partySize} ways)` : '';
      Alert.alert(
        'Parcel claimed!',
        areaM2 != null
          ? `${formatAreaM2(areaM2)} of territory locked in.\n+${eachPts} points each${splitNote}.`
          : 'Your territory has been saved.'
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not claim parcel';
      Alert.alert('Claim failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 14,
        right: 14,
      }}>
      <View
        style={{
          backgroundColor: CARD_BG,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          padding: 20,
          shadowColor: '#000',
          shadowOpacity: 0.55,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 18,
        }}>

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            marginBottom: loopClosed ? 16 : 20,
          }}>
          {/* Distance */}
          <StatBox
            label="DISTANCE"
            value={distanceM > 0 ? formatDistanceM(distanceM) : '—'}
          />

          {/* Area — shown once loop is detected */}
          {loopClosed && areaM2 != null ? (
            <StatBox label="AREA" value={formatAreaM2(areaM2)} accent />
          ) : (
            <StatBox
              label="STATUS"
              value={isPaused ? 'PAUSED' : 'RECORDING'}
              color={isPaused ? '#fb923c' : '#34d399'}
            />
          )}
        </View>

        {/* ── Cooperative pair badge / button ────────────────────────────────── */}
        {partners.length > 0 ? (
          <PairedBadge partners={partners} onPairPress={onPairPress} />
        ) : (
          !loopClosed && onPairPress && (
            <Pressable
              onPress={onPairPress}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 10,
                marginBottom: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
                backgroundColor: 'rgba(255,255,255,0.04)',
              }}>
              <MaterialCommunityIcons name="account-plus-outline" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={{
                fontFamily: FONT,
                fontSize: 13,
                letterSpacing: 1.5,
                color: 'rgba(255,255,255,0.5)',
              }}>
                PAIR WITH A PARTNER
              </Text>
            </Pressable>
          )
        )}

        {/* ── Loop closed → CLAIM button ──────────────────────────────────── */}
        {loopClosed && (
          <>
            <LoopClosedBadge />
            <Pressable
              onPress={() => void handleClaim()}
              disabled={busy}
              style={{
                backgroundColor: AMBER,
                paddingVertical: 15,
                borderRadius: 14,
                alignItems: 'center',
                marginBottom: 12,
                opacity: busy ? 0.7 : 1,
                shadowColor: AMBER,
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 2 },
              }}>
              {busy ? (
                <ActivityIndicator color="#0e0e10" />
              ) : (
                <Text
                  style={{
                    fontFamily: FONT,
                    fontSize: 17,
                    fontWeight: '700',
                    color: '#0e0e10',
                    letterSpacing: 1.5,
                  }}>
                  CLAIM PARCEL
                </Text>
              )}
            </Pressable>
          </>
        )}

        {/* ── Pause / Resume + End Session ────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => void (isPaused ? onResume() : onPause())}
            style={{
              flex: 1,
              paddingVertical: 13,
              borderRadius: 13,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              backgroundColor: 'rgba(255,255,255,0.05)',
            }}>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: 14,
                color: '#fff',
                letterSpacing: 1.2,
              }}>
              {isPaused ? 'RESUME' : 'PAUSE'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Alert.alert(
                'End session?',
                'Your current route will be discarded if you haven\'t claimed the parcel.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'End',
                    style: 'destructive',
                    onPress: () => void onStop(),
                  },
                ]
              );
            }}
            style={{
              flex: 1,
              paddingVertical: 13,
              borderRadius: 13,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(248,113,113,0.3)',
              backgroundColor: 'rgba(248,113,113,0.08)',
            }}>
            <Text
              style={{
                fontFamily: FONT,
                fontSize: 14,
                color: '#f87171',
                letterSpacing: 1.2,
              }}>
              END SESSION
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  accent,
  color,
}: {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontFamily: FONT,
          fontSize: 10,
          letterSpacing: 2,
          color: 'rgba(255,255,255,0.38)',
          textTransform: 'uppercase',
          marginBottom: 5,
        }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: FONT_BIG,
          fontSize: 26,
          color: color ?? (accent ? AMBER : '#fff'),
          fontWeight: '700',
        }}>
        {value}
      </Text>
    </View>
  );
}

function PairedBadge({
  partners,
  onPairPress,
}: {
  partners: { id: string; username: string | null }[];
  onPairPress?: () => void;
}) {
  const names = partners
    .map((p) => (p.username ? `@${p.username}` : 'unknown'))
    .join(', ');

  return (
    <View
      style={{
        marginBottom: 14,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: 'rgba(99,220,150,0.08)',
        borderColor: 'rgba(99,220,150,0.3)',
        overflow: 'hidden',
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 }}>
        <MaterialCommunityIcons name="account-multiple-check" size={15} color="#63dc96" />
        <Text style={{ fontFamily: FONT, fontSize: 11, letterSpacing: 1.5, color: '#63dc96', fontWeight: '700', flex: 1 }}>
          {partners.length === 1 ? 'WALKING WITH' : `${partners.length} PARTNERS`}
        </Text>
        {onPairPress && (
          <Pressable onPress={onPairPress} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(99,220,150,0.15)' }}>
            <Text style={{ fontFamily: FONT, fontSize: 10, color: '#63dc96', letterSpacing: 1 }}>+ ADD</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(99,220,150,0.7)', paddingHorizontal: 10, paddingBottom: 10 }}>
        {names}
      </Text>
    </View>
  );
}

function LoopClosedBadge() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 8,
        marginBottom: 14,
        backgroundColor: `${AMBER}14`,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: `${AMBER}44`,
      }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: AMBER,
        }}
      />
      <Text
        style={{
          fontFamily: FONT,
          fontSize: 12,
          letterSpacing: 2,
          color: AMBER,
          fontWeight: '700',
        }}>
        LOOP CLOSED — CLAIM YOUR TERRITORY
      </Text>
    </View>
  );
}
