import { colors } from '@cheapa/config/tokens';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

/**
 * 1 px dashed `lineDashed` rule between "receipt" rows (Searching, Product, History).
 * Drawn with SVG: RN's one-sided dashed borders render solid on iOS.
 */
export function ReceiptDivider({ color = colors.lineDashed }: { color?: string }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={{ height: 1, alignSelf: 'stretch' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={1}>
          <Line x1={0} y1={0.5} x2={width} y2={0.5} stroke={color} strokeWidth={1} strokeDasharray="3 3" />
        </Svg>
      ) : null}
    </View>
  );
}
