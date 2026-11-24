export type ConverterKind = 'image' | 'cursor' | 'video' | 'strings';

export const CONVERTER_FILE_TYPES: Record<ConverterKind, { extensions: readonly string[]; kind: string }> = {
  image: { extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tga', 'dds'], kind: 'images' },
  cursor: { extensions: ['png'], kind: 'PNG images' },
  video: {
    extensions: ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi', 'wmv', 'mpg', 'mpeg', 'gif', 'bik', 'vp6', 'png', 'tga', 'dds'],
    kind: 'videos or frames',
  },
  strings: { extensions: ['str', 'csf'], kind: 'string tables' },
};
