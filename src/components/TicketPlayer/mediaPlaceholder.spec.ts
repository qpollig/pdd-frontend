import { describe, expect, it } from 'vitest';
import { mediaPlaceholderText } from './mediaPlaceholder';

describe('mediaPlaceholderText', () => {
  it('shows the "no image" copy when image_url is null', () => {
    expect(mediaPlaceholderText(null, false)).toBe('Изображение к вопросу отсутствует');
  });

  it('shows the "no image" copy regardless of a stale errored flag when there is no image', () => {
    expect(mediaPlaceholderText(null, true)).toBe('Изображение к вопросу отсутствует');
  });

  it('shows the load-error copy when an image URL failed to load', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', true)).toBe('Не удалось загрузить изображение');
  });

  it('shows no placeholder when the image is present and has not errored', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', false)).toBeNull();
  });
});
