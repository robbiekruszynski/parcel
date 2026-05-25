import { Text, View } from 'react-native';

import { TRACKING } from '@/constants/trackingTheme';

export function TrackingGpsSubBar() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 }}>
      <Text style={{ color: TRACKING.muted2, fontFamily: 'DMMono_400Regular', fontSize: 11 }}>GPS ▌▌▌</Text>
      <Text style={{ color: TRACKING.muted2, fontFamily: 'DMMono_400Regular', fontSize: 11 }}>3d ago</Text>
      <Text style={{ color: TRACKING.muted2, fontFamily: 'DMMono_400Regular', fontSize: 11 }}>5.4 MIN/KM</Text>
      <Text style={{ color: TRACKING.muted2, fontFamily: 'DMMono_400Regular', fontSize: 11 }}>142 SPM</Text>
      <Text style={{ color: TRACKING.muted2, fontFamily: 'DMMono_400Regular', fontSize: 11 }}>NE</Text>
    </View>
  );
}
