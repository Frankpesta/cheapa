import { describe, expect, it } from 'vitest';
import { thumbUrl } from './images';

describe('thumbUrl', () => {
  it('asks Jumia for the 300px rendition', () => {
    expect(
      thumbUrl('https://ng.jumia.is/unsafe/fit-in/520x520/filters:fill(white)/product/52/2394814/1.jpg?1556'),
    ).toBe('https://ng.jumia.is/unsafe/fit-in/300x300/filters:fill(white)/product/52/2394814/1.jpg?1556');
  });

  it('sets a width on Shopify and Photon URLs', () => {
    expect(thumbUrl('https://cdn.shopify.com/s/files/1/x/files/CC.png?v=17', 300)).toBe(
      'https://cdn.shopify.com/s/files/1/x/files/CC.png?v=17&width=300',
    );
    expect(thumbUrl('https://i0.wp.com/okriks.com/wp-content/uploads/a.jpg?fit=2367%2C2367&ssl=1', 600)).toBe(
      'https://i0.wp.com/okriks.com/wp-content/uploads/a.jpg?ssl=1&fit=600%2C600',
    );
  });

  it('leaves other hosts, bad URLs and empty values alone', () => {
    const jiji = 'https://pictures-nigeria.jijistatic.net/210375688_MzAwLTQyNS0yNTBlZWFmYWU1.webp';
    expect(thumbUrl(jiji)).toBe(jiji);
    expect(thumbUrl('not a url')).toBe('not a url');
    expect(thumbUrl(null)).toBeNull();
    expect(thumbUrl('')).toBeNull();
  });
});
