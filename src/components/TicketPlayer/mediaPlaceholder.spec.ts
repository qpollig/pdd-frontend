import { describe, expect, it } from 'vitest';
import { mediaPlaceholderText, selectedMediaKind } from './mediaPlaceholder';

describe('mediaPlaceholderText', () => {
  it('shows the "no media" copy when neither image_url nor video_url is present', () => {
    expect(mediaPlaceholderText(null, null, false)).toBe('Изображение к вопросу отсутствует');
  });

  it('shows the "no media" copy regardless of a stale errored flag when there is no media', () => {
    expect(mediaPlaceholderText(null, null, true)).toBe('Изображение к вопросу отсутствует');
  });

  it('shows the image load-error copy when an image URL failed to load', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', null, true)).toBe('Не удалось загрузить изображение');
  });

  it('shows no placeholder when the image is present and has not errored', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', null, false)).toBeNull();
  });

  it('shows no placeholder when only a video is present and has not errored', () => {
    expect(mediaPlaceholderText(null, 'https://cdn.example/vid.mp4', false)).toBeNull();
  });

  it('shows the video load-error copy when only a video is present and failed to load', () => {
    expect(mediaPlaceholderText(null, 'https://cdn.example/vid.mp4', true)).toBe('Не удалось загрузить видео');
  });

  it('shows no placeholder when both image and video are present and the image has not errored', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', 'https://cdn.example/vid.mp4', false)).toBeNull();
  });

  it('shows the image load-error copy (not the video one) when both are present and the image failed', () => {
    expect(mediaPlaceholderText('https://cdn.example/img.jpg', 'https://cdn.example/vid.mp4', true)).toBe(
      'Не удалось загрузить изображение',
    );
  });
});

describe('selectedMediaKind', () => {
  it('picks image when both image and video are present', () => {
    expect(selectedMediaKind('https://cdn.example/img.jpg', 'https://cdn.example/vid.mp4')).toBe('image');
  });

  it('picks video when only video is present', () => {
    expect(selectedMediaKind(null, 'https://cdn.example/vid.mp4')).toBe('video');
  });

  it('picks nothing when neither is present', () => {
    expect(selectedMediaKind(null, null)).toBeNull();
  });
});
