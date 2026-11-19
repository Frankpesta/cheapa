/**
 * PriceChart geometry (Product): price points -> SVG polyline in a fixed box. Higher
 * price = higher on screen. Pure, so it is unit-tested.
 */

export interface ChartGeometry {
  points: string;
  lastX: number;
  lastY: number;
  highKobo: number;
  lowKobo: number;
}

export const CHART = { width: 310, height: 104, padTop: 8, baseline: 96, endInset: 6 } as const;

export function chartGeometry(values: readonly number[]): ChartGeometry | null {
  if (values.length === 0) return null;
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;
  const usable = CHART.baseline - 6 - CHART.padTop; // keep the line off the baseline
  const step = values.length > 1 ? (CHART.width - CHART.endInset) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? i * step : CHART.width - CHART.endInset;
    const y = hi === lo ? CHART.padTop + usable / 2 : CHART.padTop + ((hi - v) / span) * usable;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const last = pts[pts.length - 1]!;
  return {
    points: pts.map(([x, y]) => `${x},${y}`).join(' '),
    lastX: last[0],
    lastY: last[1],
    highKobo: hi,
    lowKobo: lo,
  };
}
