import { AppState, Platform } from 'react-native';

const GROUP_INVITE_NOTIFICATION_ID = 'parcel-group-invite';

/**
 * Fire a local notification when the app is backgrounded to let the user know
 * they received a group invite. The invite code is shown directly in the
 * notification body so they can note it down or come back and copy it.
 */
export async function notifyPendingGroupJoin(
  groupName: string,
  inviteCode?: string,
): Promise<void> {
  if (AppState.currentState === 'active') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('invites', {
        name: 'Group invites',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const body = inviteCode
      ? `You've been invited to join ${groupName}. Code: ${inviteCode} — open Groups → Join to enter it.`
      : `You've been invited to join ${groupName}. Open the Groups tab to see your invite.`;

    await Notifications.scheduleNotificationAsync({
      identifier: GROUP_INVITE_NOTIFICATION_ID,
      content: {
        title: 'Group invite 🏅',
        body,
        data: { screen: 'groups', inviteCode: inviteCode ?? null },
        ...(Platform.OS === 'android' ? { channelId: 'invites' } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    if (__DEV__) console.warn('[groupInviteNotify]', e);
  }
}
