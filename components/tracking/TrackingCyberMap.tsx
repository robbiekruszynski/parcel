import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
  G,
} from 'react-native-svg';

import { TRACKING } from '@/constants/trackingTheme';

const VB_W = 360;
const VB_H = 280;

/** Completed loop (lime) + active tail (cyan) — mock coordinates in viewBox space */
const PATH_COMPLETED =
  'M 178 218 L 118 168 L 158 88 L 238 72 L 298 118 L 278 188 L 218 232 Z';
const PATH_ACTIVE_TAIL = 'M 218 232 L 196 224';

const DOTTED_GUIDE = { x1: 196, y1: 224, x2: 182, y2: 214 };

const BLOCKS = [
  { x: 14, y: 22, w: 108, h: 82, stroke: TRACKING.territory.warren, label: '@warren' },
  { x: 236, y: 44, w: 96, h: 104, stroke: TRACKING.territory.kestzel, label: '@kestzel' },
  { x: 252, y: 192, w: 92, h: 72, stroke: TRACKING.territory.nightowl, label: '@nightowl' },
  { x: 132, y: 204, w: 76, h: 58, stroke: TRACKING.territory.stalker, label: '@stalker', muted: true },
];

export function TrackingCyberMap() {
  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= VB_W; x += 24) {
    gridLines.push(
      <Line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={VB_H}
        stroke={TRACKING.gridLine}
        strokeWidth={1}
      />
    );
  }
  for (let y = 0; y <= VB_H; y += 24) {
    gridLines.push(
      <Line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={VB_W}
        y2={y}
        stroke={TRACKING.gridLine}
        strokeWidth={1}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: TRACKING.bgElev, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="limeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={TRACKING.neonLime} stopOpacity={1} />
            <Stop offset="100%" stopColor="#9fe82a" stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={TRACKING.neonCyan} stopOpacity={1} />
            <Stop offset="100%" stopColor="#00c8ff" stopOpacity={1} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={VB_W} height={VB_H} fill={TRACKING.gridBlock} />
        {gridLines}

        {BLOCKS.map((b, i) => (
          <G key={i}>
            <Rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill="rgba(255,255,255,0.02)"
              stroke={b.stroke}
              strokeWidth={b.muted ? 1 : 1.4}
              strokeDasharray={b.muted ? '4 6' : '7 5'}
              opacity={b.muted ? 0.55 : 0.95}
            />
            <SvgText
              x={b.x + 6}
              y={b.y + b.h - 6}
              fill={TRACKING.muted2}
              fontSize={9}
              fontFamily="DMMono_400Regular"
              letterSpacing={1}>
              {b.label}
            </SvgText>
          </G>
        ))}

        <Path d={PATH_COMPLETED} stroke={TRACKING.neonLime} strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.15} />
        <Path d={PATH_COMPLETED} stroke={TRACKING.neonLime} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.28} />
        <Path d={PATH_COMPLETED} stroke="url(#limeGlow)" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        <Path d={PATH_ACTIVE_TAIL} stroke={TRACKING.neonCyan} strokeWidth={12} fill="none" strokeLinecap="round" opacity={0.22} />
        <Path d={PATH_ACTIVE_TAIL} stroke="url(#cyanGlow)" strokeWidth={5} fill="none" strokeLinecap="round" />

        <Circle cx={178} cy={218} r={22} stroke={TRACKING.neonCyan} strokeWidth={1} strokeDasharray="4 4" fill="rgba(0,245,255,0.04)" />

        <Circle cx={178} cy={218} r={7} fill="#1e90ff" stroke={TRACKING.neonCyan} strokeWidth={2} opacity={0.95} />
        <SvgText x={178} y={198} fill={TRACKING.muted} fontSize={9} fontFamily="DMMono_400Regular" textAnchor="middle" letterSpacing={1}>
          START
        </SvgText>

        <Line
          x1={DOTTED_GUIDE.x1}
          y1={DOTTED_GUIDE.y1}
          x2={DOTTED_GUIDE.x2}
          y2={DOTTED_GUIDE.y2}
          stroke={TRACKING.white}
          strokeWidth={1.5}
          strokeDasharray="4 5"
          opacity={0.55}
        />

        <Circle cx={196} cy={224} r={6} fill={TRACKING.white} stroke={TRACKING.amber} strokeWidth={2} />
      </Svg>
    </View>
  );
}
