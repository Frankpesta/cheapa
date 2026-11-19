import { colors } from '@cheapa/config/tokens';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { CHART, chartGeometry } from '../lib/chart';
import { formatNaira } from '../lib/format';
import { Text } from './Text';

/**
 * 104 tall line chart: ink 2.4 stroke, lime end dot, dashed mid gridline, mono high/now
 * labels (Product "Cheapest new price"). Stretches to its container's width.
 */
export function PriceChart({
  valuesKobo,
  accessibilityLabel,
}: {
  valuesKobo: readonly number[];
  accessibilityLabel: string;
}) {
  const g = chartGeometry(valuesKobo);
  const now = valuesKobo[valuesKobo.length - 1];
  return (
    <View>
      <Svg
        width="100%"
        height={CHART.height}
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={{ marginTop: 10 }}
      >
        <Line
          x1={0}
          y1={CHART.baseline}
          x2={CHART.width}
          y2={CHART.baseline}
          stroke={colors.line}
          strokeWidth={1}
        />
        <Line
          x1={0}
          y1={50}
          x2={CHART.width}
          y2={50}
          stroke={colors.track}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        {g ? (
          <>
            <Polyline
              points={g.points}
              fill="none"
              stroke={colors.ink}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Circle cx={g.lastX} cy={g.lastY} r={5} fill={colors.lime} stroke={colors.ink} strokeWidth={2} />
          </>
        ) : null}
      </Svg>
      {g && now !== undefined ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text variant="mono" style={{ color: colors.muted }}>
            high {formatNaira(g.highKobo)}
          </Text>
          <Text variant="mono">now {formatNaira(now)}</Text>
        </View>
      ) : null}
    </View>
  );
}
