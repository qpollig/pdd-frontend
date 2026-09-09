/**
 * B4: what MediaBlock should show instead of the real image — `null` means render the image itself.
 * A missing `image` and a failed load get distinct copy so "no photo for this question" doesn't
 * read as "something broke".
 */
export function mediaPlaceholderText(image: string | null, loadErrored: boolean): string | null {
  if (!image) return 'Изображение к вопросу отсутствует';
  if (loadErrored) return 'Не удалось загрузить изображение';
  return null;
}
