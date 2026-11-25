/**
 * Share sheet → search (06 §6.2). Lives in the root layout under ShareIntentProvider, so a
 * share opens straight into Searching whether the app was running or fully closed. The
 * shared file is a copy on disk; it is downscaled for upload and then deleted (rule 4).
 */
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef } from 'react';
import { shareAction } from '../../lib/share';
import { useStartSearch } from '../../lib/use-start-search';

export function ShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { image, text } = useStartSearch();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (!hasShareIntent || handled.current === shareIntent) return;
    handled.current = shareIntent;
    const action = shareAction(shareIntent);
    // Clear the native copy first: a second share while this one runs must not be lost.
    resetShareIntent();
    if (!action) return;
    switch (action.kind) {
      case 'image':
        void image(action.photo, 'share', { discardOriginal: true }).catch(() =>
          router.push({ pathname: '/shared', params: { reason: 'file' } }),
        );
        return;
      case 'text':
        text(action.query, action.source);
        return;
      case 'unsupported':
        router.push({ pathname: '/shared', params: { reason: action.reason } });
    }
  }, [hasShareIntent, shareIntent, resetShareIntent, image, text]);

  return null;
}
