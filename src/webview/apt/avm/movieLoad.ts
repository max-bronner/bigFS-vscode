export const movieNameOf = (url: string): string | undefined => {
  const file = url.trim().split(/[\\/]/).pop() ?? '';
  const dot = file.lastIndexOf('.');
  const stem = dot < 0 ? file : file.slice(0, dot);

  return stem ? stem.toLowerCase() : undefined;
};

const WINDOWS = new Set(['_blank', '_self', '_top', '_parent']);

export const isWindowTarget = (target: string): boolean => {
  const lower = target.trim().toLowerCase();

  return !lower || WINDOWS.has(lower);
};

export const levelOf = (target: string): number | undefined => {
  const match = /^_level(\d+)$/i.exec(target.trim());

  return match ? Number(match[1]) : undefined;
};

const lastName = (command: string): string => {
  const scope = command.lastIndexOf('::');

  return scope < 0 ? command : command.slice(scope + 2);
};

const PLAY_SOUND = 'playsound';

export const soundEventOf = (
  call: string,
  args: readonly string[],
): string | undefined => {
  let event: string;

  if (/^fscommand:/i.test(call)) {
    if (
      lastName(call.slice('fscommand:'.length)).toLowerCase() !== PLAY_SOUND
    ) {
      return undefined;
    }
    event = args[0] ?? '';
  } else if (/^gamecode(noprefix)?$/i.test(call)) {
    if (lastName(args[0] ?? '').toLowerCase() !== PLAY_SOUND) {
      return undefined;
    }
    event = args.slice(1).join(',');
  } else {
    return undefined;
  }
  return event.trim() || undefined;
};
