export type MediaKind = 'image' | 'video';

/**
 * B4/B10: which media MediaBlock renders when a question has both — image always wins, video is
 * only shown when there is no image. `null` means neither is present.
 */
export function selectedMediaKind(image: string | null, video: string | null): MediaKind | null {
  if (image) return 'image';
  if (video) return 'video';
  return null;
}

/**
 * B4/B10: what MediaBlock should show instead of the real media — `null` means render the media
 * itself. A missing media and a failed load get distinct copy so "no media for this question"
 * doesn't read as "something broke".
 */
export function mediaPlaceholderText(image: string | null, video: string | null, loadErrored: boolean): string | null {
  const kind = selectedMediaKind(image, video);
  if (!kind) return 'Изображение к вопросу отсутствует';
  if (loadErrored) {
    return kind === 'video' ? 'Не удалось загрузить видео' : 'Не удалось загрузить изображение';
  }
  return null;
}
