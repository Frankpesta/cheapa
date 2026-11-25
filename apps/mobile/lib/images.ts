/**
 * Data-light images (06 §6.4): ask store CDNs that can resize for a small copy instead of
 * the full product photo. Hosts we don't know are left alone; we never re-host images
 * (rule 3), so the phone always loads from the store's own CDN.
 */
export const THUMB_PX = 300;

export function thumbUrl(url: string | null | undefined, px: number = THUMB_PX): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const size = Math.round(px);
  switch (u.hostname) {
    // https://ng.jumia.is/unsafe/fit-in/520x520/filters:fill(white)/product/…
    case 'ng.jumia.is':
      u.pathname = u.pathname.replace(/\/fit-in\/\d+x\d+\//, `/fit-in/${size}x${size}/`);
      break;
    // Shopify's CDN resizes on ?width=
    case 'cdn.shopify.com':
      u.searchParams.set('width', String(size));
      u.searchParams.delete('height');
      break;
    // Jetpack Photon (WordPress / WooCommerce stores): ?fit=W,H or ?resize=W,H, else ?w=
    case 'i0.wp.com':
    case 'i1.wp.com':
    case 'i2.wp.com':
      u.searchParams.delete('resize');
      u.searchParams.delete('fit');
      u.searchParams.set('fit', `${size},${size}`);
      break;
    // pictures-nigeria.jijistatic.net ids already encode a ~300px rendition.
    default:
      return url;
  }
  return u.toString();
}
