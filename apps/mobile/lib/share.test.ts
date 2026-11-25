import { describe, expect, it } from 'vitest';
import { shareAction, slugWords } from './share';

const none = { files: null, webUrl: null } as const;

describe('shareAction', () => {
  it('searches the first shared image with its size', () => {
    const action = shareAction({
      ...none,
      files: [
        { path: 'file:///a.pdf', mimeType: 'application/pdf', width: null, height: null },
        { path: 'file:///shot.png', mimeType: 'image/png', width: 1080, height: 2400 },
      ],
    });
    expect(action).toEqual({
      kind: 'image',
      photo: { uri: 'file:///shot.png', width: 1080, height: 2400 },
    });
  });

  it('leaves out unknown dimensions', () => {
    const action = shareAction({
      ...none,
      files: [{ path: 'file:///s.jpg', mimeType: 'image/jpeg', width: null, height: null }],
    });
    expect(action).toEqual({ kind: 'image', photo: { uri: 'file:///s.jpg' } });
  });

  it('refuses non-image files', () => {
    const action = shareAction({
      ...none,
      files: [{ path: 'file:///v.mp4', mimeType: 'video/mp4', width: 1, height: 1 }],
    });
    expect(action).toEqual({ kind: 'unsupported', reason: 'file' });
  });

  it('turns shared text into a text search, without hashtags or emoji', () => {
    expect(shareAction({ ...none, text: 'Black satin slip dress 😍 #asoebi @vendor' })).toEqual({
      kind: 'text',
      query: 'Black satin slip dress',
      source: 'text',
    });
  });

  it('uses the words around a link and marks it as a link search', () => {
    expect(
      shareAction({ ...none, text: 'See this bag https://x.ng/p/1', webUrl: 'https://x.ng/p/1' }),
    ).toEqual({ kind: 'text', query: 'See this bag', source: 'link' });
  });

  it('falls back to the page title, then the store slug', () => {
    const url = 'https://www.jumia.com.ng/apple-iphone-15-128gb-black-341234567.html';
    expect(shareAction({ ...none, text: url, webUrl: url, meta: { title: 'Ankara gown' } })).toEqual({
      kind: 'text',
      query: 'Ankara gown',
      source: 'link',
    });
    expect(shareAction({ ...none, text: url, webUrl: url })).toEqual({
      kind: 'text',
      query: 'apple iphone 15 128gb black',
      source: 'link',
    });
  });

  it('cannot search a bare Instagram post link yet', () => {
    const url = 'https://www.instagram.com/p/DAbc12XyZ9q/';
    expect(shareAction({ ...none, text: url, webUrl: url })).toEqual({
      kind: 'unsupported',
      reason: 'link',
    });
  });

  it('ignores an empty share', () => {
    expect(shareAction({ ...none, text: '  ' })).toBeNull();
  });

  it('clips long captions at a word boundary', () => {
    const q = shareAction({ ...none, text: 'word '.repeat(60) });
    expect(q?.kind).toBe('text');
    if (q?.kind === 'text') expect(q.query.length).toBeLessThanOrEqual(120);
  });
});

describe('slugWords', () => {
  it('drops ids, hashes and extensions', () => {
    expect(slugWords('https://jiji.ng/ikeja/bags/ladies-handbag-brown-q3Xa9bQ7kLmN.html')).toBe(
      'ladies handbag brown',
    );
  });

  it('returns nothing for bad URLs or id-only paths', () => {
    expect(slugWords('not a url')).toBe('');
    expect(slugWords('https://shop.ng/p/12345678')).toBe('');
  });
});
