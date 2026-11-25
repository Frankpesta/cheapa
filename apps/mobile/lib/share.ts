/**
 * What to do with something shared to Cheapa (06 §6.2). Images become an image search.
 * Text and links become a text search when we can pull product words out of them; a bare
 * link with no readable words (an Instagram post URL) cannot be searched yet, because the
 * API has no paste-link endpoint (05 §5.3 "imageUrl for paste-link later").
 *
 * Pure: the share-intent shape is copied in here so this file runs under vitest.
 */

export type SharedFile = {
  path: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type SharedContent = {
  files: SharedFile[] | null;
  text?: string | null | undefined;
  webUrl: string | null;
  meta?: { title?: string | undefined } | null | undefined;
};

export type ShareAction =
  | { kind: 'image'; photo: { uri: string; width?: number; height?: number } }
  | { kind: 'text'; query: string; source: 'link' | 'text' }
  | { kind: 'unsupported'; reason: 'link' | 'file' };

const URL_RE = /https?:\/\/\S+/gi;
const MAX_QUERY = 120;

export function shareAction(shared: SharedContent): ShareAction | null {
  const files = shared.files ?? [];
  const image = files.find((f) => f.mimeType.startsWith('image/'));
  if (image) {
    return {
      kind: 'image',
      photo: {
        uri: image.path,
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
      },
    };
  }
  if (files.length > 0) return { kind: 'unsupported', reason: 'file' };

  const text = shared.text?.trim() ?? '';
  const url = shared.webUrl ?? text.match(URL_RE)?.[0] ?? null;
  const words = clean(text.replace(URL_RE, ' '));
  if (words.length >= 2) return { kind: 'text', query: clip(words), source: url ? 'link' : 'text' };
  if (!url) return null;

  const fromLink = clean(shared.meta?.title ?? '') || slugWords(url);
  if (fromLink.length >= 2) return { kind: 'text', query: clip(fromLink), source: 'link' };
  return { kind: 'unsupported', reason: 'link' };
}

/**
 * Product words from a store URL path: `jumia.com.ng/apple-iphone-15-128gb-black-341234.html`
 * gives "apple iphone 15 128gb black". Ids (long digit runs, hashes) and file extensions go.
 */
export function slugWords(url: string): string {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return '';
  }
  const segments = path.split('/').filter(Boolean);
  // The longest hyphenated segment is the product slug; short ones are categories or ids.
  const slug = segments.filter((s) => /[-_]/.test(s)).sort((a, b) => b.length - a.length)[0];
  if (!slug) return '';
  const words = slug
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .split(/[-_+\s]+/)
    .filter((w) => w && !/^\d{5,}$/.test(w) && !/^(?=.*\d)[a-z0-9]{10,}$/i.test(w));
  return words.length >= 2 ? words.join(' ') : '';
}

function clean(s: string): string {
  return s
    .replace(/[#@]\w+/g, ' ')
    .replace(/[^\p{L}\p{N}₦.,'&/+\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(s: string): string {
  if (s.length <= MAX_QUERY) return s;
  const cut = s.slice(0, MAX_QUERY);
  return cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : MAX_QUERY).trim();
}
