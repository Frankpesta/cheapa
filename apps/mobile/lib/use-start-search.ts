/**
 * Entry points into a search: typed text, camera shot, gallery pick. Each mints a session
 * (lib/search-session.ts) and routes to /search/[requestId], which shows Searching.
 */
import type { SearchSource } from '@cheapa/core/client';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { discardFile, prepareImage } from './image';
import { getPrefs } from './prefs';
import { startSearch } from './search-session';

export function useStartSearch() {
  const [busy, setBusy] = useState(false);

  const text = useCallback((query: string, source: SearchSource = 'text', replace = false) => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = startSearch({ kind: 'text', query: q, source });
    const href = { pathname: '/search/[requestId]', params: { requestId: id } } as const;
    if (replace) router.replace(href);
    else router.push(href);
  }, []);

  const image = useCallback(
    async (
      photo: { uri: string; width?: number; height?: number },
      source: Exclude<SearchSource, 'text'>,
      opts: { replace?: boolean; discardOriginal?: boolean } = {},
    ) => {
      setBusy(true);
      try {
        const prepared = await prepareImage(photo, getPrefs().dataSaver);
        // A shared image is our own copy: show the downscaled one, delete the original below.
        const thumb = opts.discardOriginal ? prepared.uri : photo.uri;
        const id = startSearch({ kind: 'image', image: prepared, source });
        const href = {
          pathname: '/search/[requestId]',
          params: { requestId: id, thumb },
        } as const;
        if (opts.replace) router.replace(href);
        else router.push(href);
      } finally {
        if (opts.discardOriginal) discardFile(photo.uri);
        setBusy(false);
      }
    },
    [],
  );

  /** Gallery pick (Home, Camera). Returns false when the user cancels. */
  const gallery = useCallback(
    async (opts: { replace?: boolean } = {}) => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = res.canceled ? null : res.assets[0];
      if (!asset) return false;
      await image(asset, 'gallery', opts);
      return true;
    },
    [image],
  );

  return { text, image, gallery, busy };
}
