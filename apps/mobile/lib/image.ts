/**
 * Downscale before upload (06 §6.2): longest side 1080 px, JPEG 0.8. Data saver drops to
 * 720 px / 0.7. The photo stays on the phone in the cache dir and is never stored by us.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { UploadImage } from './api';

export async function prepareImage(
  src: { uri: string; width?: number; height?: number },
  dataSaver: boolean,
): Promise<UploadImage> {
  const max = dataSaver ? 720 : 1080;
  const ctx = ImageManipulator.manipulate(src.uri);
  const w = src.width ?? 0;
  const h = src.height ?? 0;
  if (w > max || h > max || !w || !h) {
    ctx.resize(w >= h ? { width: max } : { height: max });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: dataSaver ? 0.7 : 0.8 });
  return { uri: out.uri, mimeType: 'image/jpeg' };
}
