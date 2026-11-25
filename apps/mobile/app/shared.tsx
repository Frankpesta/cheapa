import { router, useLocalSearchParams } from 'expo-router';
import { NotFound } from '../features/search/NotFound';
import { useStartSearch } from '../lib/use-start-search';

const COPY = {
  link: {
    title: 'Send the picture, not the link.',
    body: "We can't open links from Instagram or WhatsApp yet. Screenshot the post and share the screenshot to Cheapa, or type what you saw.",
  },
  file: {
    title: "We couldn't read that.",
    body: 'Share a photo or screenshot of the item, or type what you saw and we go search by name.',
  },
} as const;

/** A share we can't search (a bare post link, a video). No design: composed from NotFound. */
export default function SharedScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const copy = reason === 'link' ? COPY.link : COPY.file;
  const start = useStartSearch();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <NotFound
      title={copy.title}
      body={copy.body}
      onBack={back}
      onSearch={(q) => start.text(q, 'text', true)}
    />
  );
}
