/**
 * map.tsx — Main map screen
 *
 * The activity selector at the top serves dual purpose:
 *  1. Filters which parcels are shown (each activity is its own competition layer)
 *  2. Tags any new recording with that activity type
 *
 * Locked during an active session — can't switch layers mid-recording.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ParcelMap } from '@/components/ParcelMap';
import { ParcelRecordingOverlay } from '@/components/ParcelRecordingOverlay';
import { StravaUploadToast } from '@/components/StravaUploadToast';
import { usePairing } from '@/hooks/usePairing';
import { useParcelTracking, type ActivityType } from '@/hooks/useParcelTracking';
import { usePairStore } from '@/stores/pairStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const FONT  = 'Rajdhani_600SemiBold';

const ACTIVITY_TABS: {
  id: ActivityType;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}[] = [
  { id: 'walking',      icon: 'walk',        label: 'Walk'  },
  { id: 'running',      icon: 'run',         label: 'Run'   },
  { id: 'cycling',      icon: 'bike',        label: 'Cycle' },
  { id: 'rollerblading', icon: 'rollerblade', label: 'Skate' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [activityType, setActivityType] = useState<ActivityType>('walking');

  // Modals
  const [showFindPartner, setShowFindPartner] = useState(false);
  const [showHelp,        setShowHelp]        = useState(false);

  const {
    isTracking,
    isPaused,
    loopClosed,
    distanceM,
    areaM2,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    claimParcel,
  } = useParcelTracking(activityType);

  const { sendPairRequest, acceptRequest, declineRequest, cancelInvite } = usePairing();

  const partners        = usePairStore((s) => s.partners);
  const pendingInvites  = usePairStore((s) => s.pendingInvites);
  const incomingRequest = usePairStore((s) => s.incomingRequest);

  const activityLocked = isTracking || isPaused;

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* ── Full-screen map — filtered to selected activity layer ────────── */}
      <ParcelMap activityFilter={activityType} />

      {/* ── Activity / layer selector ─────────────────────────────────────── */}
      <View
        pointerEvents="box-none"
        style={[styles.selectorWrap, { top: insets.top + 12 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorInner}>
          {ACTIVITY_TABS.map((tab) => {
            const active  = activityType === tab.id;
            const dimmed  = activityLocked && !active;
            return (
              <Pressable
                key={tab.id}
                onPress={() => { if (!activityLocked) setActivityType(tab.id); }}
                disabled={activityLocked && !active}
                style={[
                  styles.tab,
                  active  && styles.tabActive,
                  dimmed  && styles.tabDimmed,
                ]}>
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={16}
                  color={active ? '#0e0e10' : 'rgba(255,255,255,0.55)'}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Recording overlay ─────────────────────────────────────────────── */}
      <ParcelRecordingOverlay
        isTracking={isTracking}
        isPaused={isPaused}
        loopClosed={loopClosed}
        distanceM={distanceM}
        areaM2={areaM2}
        partners={partners}
        onPairPress={() => setShowFindPartner(true)}
        onStart={startTracking}
        onPause={pauseTracking}
        onResume={resumeTracking}
        onStop={stopTracking}
        onClaim={claimParcel}
      />

      {/* ── Incoming pair request modal ────────────────────────────────────── */}
      <Modal
        visible={incomingRequest !== null}
        transparent
        animationType="slide"
        onRequestClose={() =>
          incomingRequest && void declineRequest(incomingRequest.id)
        }>
        {incomingRequest && (
          <IncomingRequestSheet
            fromUsername={incomingRequest.fromUsername}
            onAccept={() => void acceptRequest(incomingRequest.id)}
            onDecline={() => void declineRequest(incomingRequest.id)}
          />
        )}
      </Modal>

      {/* ── Find-partner modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showFindPartner}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFindPartner(false)}>
        <FindPartnerSheet
          partners={partners}
          pendingInvites={pendingInvites}
          onSend={sendPairRequest}
          onCancelInvite={cancelInvite}
          onClose={() => setShowFindPartner(false)}
        />
      </Modal>

      {/* ── Strava upload toast ───────────────────────────────────────────────── */}
      <StravaUploadToast />

      {/* ── Help / FAQ button — stacked below the locate-me button ──────────── */}
      <Pressable
        onPress={() => setShowHelp(true)}
        style={[styles.helpBtn, { top: insets.top + 70 }]}>
        <Text style={styles.helpBtnText}>?</Text>
      </Pressable>

      {/* ── Help modal ────────────────────────────────────────────────────────── */}
      <Modal
        visible={showHelp}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHelp(false)}>
        <HelpModal onClose={() => setShowHelp(false)} />
      </Modal>
    </View>
  );
}

// ─── Incoming request sheet ───────────────────────────────────────────────────

function IncomingRequestSheet({
  fromUsername,
  onAccept,
  onDecline,
}: {
  fromUsername: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={sheetStyles.backdrop}>
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <MaterialCommunityIcons
          name="account-multiple-plus"
          size={36}
          color="#63dc96"
          style={{ alignSelf: 'center', marginBottom: 12 }}
        />
        <Text style={sheetStyles.title}>Pair Request</Text>
        <Text style={sheetStyles.body}>
          <Text style={sheetStyles.highlight}>@{fromUsername ?? 'someone'}</Text>
          {' '}wants to walk with you — points on the next claimed parcel will be split equally among your party.
        </Text>
        <View style={sheetStyles.row}>
          <Pressable style={[sheetStyles.btn, sheetStyles.btnDecline]} onPress={onDecline}>
            <Text style={sheetStyles.btnDeclineText}>Decline</Text>
          </Pressable>
          <Pressable style={[sheetStyles.btn, sheetStyles.btnAccept]} onPress={onAccept}>
            <Text style={sheetStyles.btnAcceptText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Find-partner sheet ───────────────────────────────────────────────────────

function FindPartnerSheet({
  partners,
  pendingInvites,
  onSend,
  onCancelInvite,
  onClose,
}: {
  partners: { id: string; username: string | null }[];
  pendingInvites: { requestId: string; toUserId: string; toUsername: string }[];
  onSend: (username: string) => Promise<void>;
  onCancelInvite: (requestId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSend = useCallback(async () => {
    if (!username.trim()) return;
    setBusy(true);
    try {
      await onSend(username.trim());
      setUsername(''); // clear input after successful send
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send request');
    } finally {
      setBusy(false);
    }
  }, [username, onSend]);

  const hasActivity = partners.length > 0 || pendingInvites.length > 0;

  return (
    <View style={sheetStyles.backdrop}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />

        {/* Header row */}
        <View style={partnerStyles.headerRow}>
          <Text style={sheetStyles.title}>Walking Party</Text>
          <Pressable onPress={onClose} style={partnerStyles.doneBtn}>
            <Text style={partnerStyles.doneTxt}>Done</Text>
          </Pressable>
        </View>

        <Text style={[sheetStyles.body, { marginBottom: hasActivity ? 14 : 8 }]}>
          Add partners by @username. Points split equally when you claim.
        </Text>

        {/* Confirmed partners */}
        {partners.map((p) => (
          <View key={p.id} style={partnerStyles.row}>
            <MaterialCommunityIcons name="account-check" size={15} color="#63dc96" />
            <Text style={partnerStyles.name}>@{p.username ?? 'unknown'}</Text>
            <View style={partnerStyles.confirmedBadge}>
              <Text style={partnerStyles.confirmedTxt}>CONFIRMED</Text>
            </View>
          </View>
        ))}

        {/* Pending invites */}
        {pendingInvites.map((inv) => (
          <View key={inv.requestId} style={partnerStyles.row}>
            <ActivityIndicator size="small" color="#f5c518" style={{ width: 15 }} />
            <Text style={[partnerStyles.name, { color: '#f5c518' }]}>@{inv.toUsername}</Text>
            <Pressable
              onPress={() => void onCancelInvite(inv.requestId)}
              style={partnerStyles.cancelBtn}>
              <Text style={partnerStyles.cancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        ))}

        {hasActivity && <View style={partnerStyles.divider} />}

        {/* Add partner input */}
        <View style={sheetStyles.inputRow}>
          <Text style={sheetStyles.atSign}>@</Text>
          <TextInput
            style={sheetStyles.input}
            placeholder="username"
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => void handleSend()}
          />
        </View>

        <Pressable
          style={[sheetStyles.btn, sheetStyles.btnAccept, (!username.trim() || busy) && { opacity: 0.5 }]}
          onPress={() => void handleSend()}
          disabled={!username.trim() || busy}>
          {busy
            ? <ActivityIndicator color="#0e0e10" size="small" />
            : <Text style={sheetStyles.btnAcceptText}>Send Request</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Help / FAQ Modal ─────────────────────────────────────────────────────────

const FAQ_SECTIONS: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  title: string;
  body: string;
}[] = [
  {
    icon: 'map-marker-path',
    iconColor: '#f5c518',
    title: 'Claiming a Parcel',
    body:
      'Tap START PARCEL, then walk any loop outdoors. When you arrive back close to your starting point, the loop locks and CLAIM PARCEL appears. Tap it to permanently stake that area as yours.',
  },
  {
    icon: 'lightning-bolt',
    iconColor: '#f5c518',
    title: 'Points & Ticking',
    body:
      'You earn points instantly when you claim based on the parcel\'s area (roughly 1 pt per 50 m²). Every 5 minutes, every parcel you own ticks +1 point to your profile. Bigger parcels = bigger ticks. Hold territory longer = earn more.',
  },
  {
    icon: 'layers-outline',
    iconColor: '#60a5fa',
    title: 'Activity Layers',
    body:
      'Walk, Run, Cycle, and Skate are separate competitive layers — like four different games on the same map. The tabs at the top of the map switch layers. You can only see and claim parcels on your selected layer, so walkers and cyclists don\'t compete directly.',
  },
  {
    icon: 'account-plus-outline',
    iconColor: '#63dc96',
    title: 'Pairing with Someone',
    body:
      'Start a recording session, then tap PAIR WITH A PARTNER on the recording card. Enter your partner\'s @username and send the request. They\'ll receive a notification — once they accept (within 2 minutes), you\'re linked. The next CLAIM PARCEL by either of you creates a co-owned parcel and splits points 50/50 between both players.',
  },
  {
    icon: 'account-multiple-check-outline',
    iconColor: '#63dc96',
    title: 'Pairing Across Groups',
    body:
      'Yes — you can pair with anyone, regardless of group membership. Pairing is a per-walk mechanic, completely separate from groups. Two players in the same group can pair. Two players in different groups can pair. Someone in no group at all can pair with anyone. The co-owned parcel will show on both players\' territory lists.',
  },
  {
    icon: 'account-group-outline',
    iconColor: '#a78bfa',
    title: 'Groups',
    body:
      'Groups are private leaderboards. Create a group, invite friends by @username, and all your points automatically count toward the group ranking too. You can be a member of multiple groups. Group scores are the sum of each member\'s total points — co-claimed points count for both partners individually.',
  },
  {
    icon: 'shield-check-outline',
    iconColor: '#fb923c',
    title: 'Defending Territory',
    body:
      'There\'s no attacking (yet). Once you claim a parcel it\'s yours permanently and keeps ticking. A future update will let rivals challenge and take over your parcels — for now, focus on building the biggest empire you can.',
  },
  {
    icon: 'lightbulb-on-outline',
    iconColor: '#f5c518',
    title: 'Tips',
    body:
      '• Larger loops earn more points per second\n• Pair on a big walk to halve the effort and still earn points\n• Check the Territory tab to review all your parcels\n• Connect Strava in your Profile to auto-upload every session\n• Pause mid-walk to check the map without stopping your recording',
  },
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <View style={helpStyles.root}>
      {/* ── Backdrop tap to close ── */}
      <Pressable style={{ flex: 1 }} onPress={onClose} />

      {/* ── Sheet ── */}
      <View style={helpStyles.sheet}>
        {/* Handle */}
        <View style={helpStyles.handle} />

        {/* Header */}
        <View style={helpStyles.header}>
          <View>
            <Text style={helpStyles.headerTitle}>How Parcel Works</Text>
            <Text style={helpStyles.headerSub}>Everything you need to know</Text>
          </View>
          <Pressable onPress={onClose} style={helpStyles.closeX}>
            <MaterialCommunityIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        {/* Scrollable FAQ */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={helpStyles.list}>
          {FAQ_SECTIONS.map((s, i) => (
            <View key={i} style={helpStyles.card}>
              <View style={[helpStyles.iconWrap, { backgroundColor: s.iconColor + '18' }]}>
                <MaterialCommunityIcons name={s.icon} size={20} color={s.iconColor} />
              </View>
              <View style={helpStyles.cardBody}>
                <Text style={helpStyles.cardTitle}>{s.title}</Text>
                <Text style={helpStyles.cardBody2}>{s.body}</Text>
              </View>
            </View>
          ))}

          {/* Footer */}
          <View style={helpStyles.footer}>
            <MaterialCommunityIcons name="map-outline" size={16} color="rgba(255,255,255,0.2)" />
            <Text style={helpStyles.footerText}>Parcel — Go outside. Own the block.</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const helpStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#0e0e10',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 26,
    color: '#fff',
    letterSpacing: 0.4,
  },
  headerSub: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  closeX: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#13131a',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 17,
    color: '#fff',
    letterSpacing: 0.3,
    marginBottom: 5,
  },
  cardBody2: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.52)',
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingTop: 8,
  },
  footerText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 0.5,
  },
});

// ─── Partner row styles ───────────────────────────────────────────────────────

const partnerStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  doneTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  name: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#fff',
    flex: 1,
    letterSpacing: 0.3,
  },
  confirmedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(99,220,150,0.15)',
  },
  confirmedTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    color: '#63dc96',
    letterSpacing: 1,
  },
  cancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  cancelTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    color: '#f87171',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 14,
  },
});

// ─── Sheet styles ─────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#13131a',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  highlight: {
    color: '#63dc96',
    fontFamily: 'Rajdhani_600SemiBold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  atSign: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 18,
    color: 'rgba(255,255,255,0.35)',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    color: '#fff',
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDecline: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnDeclineText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  btnAccept: {
    backgroundColor: '#63dc96',
  },
  btnAcceptText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#0e0e10',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  selectorWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  selectorInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(14,14,16,0.9)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 4,
    gap: 2,
    paddingHorizontal: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: AMBER,
  },
  tabDimmed: {
    opacity: 0.3,
  },
  tabLabel: {
    fontFamily: FONT,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#0e0e10',
    fontWeight: '700',
  },

  // Help / FAQ button
  helpBtn: {
    position: 'absolute',
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14,14,16,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 17,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
  },
});
