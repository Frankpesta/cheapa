import { describe, expect, it } from 'vitest';
import { CHART, chartGeometry } from './chart';

describe('chartGeometry', () => {
  it('maps the highest price to the top and ends at the right edge', () => {
    const g = chartGeometry([300, 200, 100])!;
    expect(g.points.split(' ')).toHaveLength(3);
    expect(g.points.startsWith('0,8')).toBe(true);
    expect(g.lastX).toBe(CHART.width - CHART.endInset);
    expect(g.lastY).toBe(CHART.baseline - 6);
    expect([g.highKobo, g.lowKobo]).toEqual([300, 100]);
  });

  it('draws a flat line mid-box and handles one or no points', () => {
    expect(chartGeometry([5, 5])!.lastY).toBe(CHART.padTop + (CHART.baseline - 6 - CHART.padTop) / 2);
    expect(chartGeometry([7])!.lastX).toBe(CHART.width - CHART.endInset);
    expect(chartGeometry([])).toBeNull();
  });
});
