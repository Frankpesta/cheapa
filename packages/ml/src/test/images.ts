/** Synthetic test images built in memory (no store images in the repo, CLAUDE.md rule 3). */
import sharp from 'sharp';

export type Shape = 'dress' | 'bag' | 'stripes';

/** A simple product-like silhouette on white, as SVG. */
export function svg(shape: Shape, colour = '#0e1a13', size = 400): string {
  const body: Record<Shape, string> = {
    // Off-centre details: perfectly symmetric drawings put half the DCT terms at ~0.
    dress:
      `<path d="M160 60 L240 60 L260 140 L330 360 L70 360 L140 140 Z" fill="${colour}"/>` +
      `<circle cx="310" cy="80" r="35" fill="#d33"/><rect x="40" y="300" width="60" height="70" fill="#36c"/>`,
    bag:
      `<rect x="90" y="150" width="220" height="180" rx="20" fill="${colour}"/>` +
      `<path d="M140 150 Q200 40 260 150" stroke="${colour}" stroke-width="16" fill="none"/>`,
    stripes: Array.from(
      { length: 10 },
      (_, i) => `<rect x="${i * 40}" y="0" width="20" height="400" fill="${colour}"/>`,
    ).join(''),
  };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 400 400">` +
    `<rect width="400" height="400" fill="#fff"/>${body[shape]}</svg>`
  );
}

export async function jpeg(
  shape: Shape,
  opts: { colour?: string; size?: number; quality?: number } = {},
): Promise<Buffer> {
  return sharp(Buffer.from(svg(shape, opts.colour, opts.size)))
    .jpeg({ quality: opts.quality ?? 85 })
    .toBuffer();
}

/** A transparent PNG cut-out (no white background). */
export async function transparentPng(): Promise<Buffer> {
  const s =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
    '<circle cx="100" cy="100" r="40" fill="#c6f432"/></svg>';
  return sharp(Buffer.from(s)).png().toBuffer();
}
