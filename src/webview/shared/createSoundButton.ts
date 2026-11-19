import type { PlaySoundRequest } from '../../core/soundClip';
import { element } from './element';
import { pageSoundPlayer } from './pageSoundPlayer';

const getOpenKeyName = (): string =>
  /mac|iphone|ipad/i.test(navigator.platform) ? 'Cmd' : 'Ctrl';

interface Subscription {
  button: WeakRef<HTMLButtonElement>;
  unsubscribe: () => void;
  wasAttached: boolean;
}

const subscriptions = new Set<Subscription>();

const pruneRemoved = (): void => {
  for (const subscription of subscriptions) {
    const button = subscription.button.deref();

    if (button?.isConnected) {
      subscription.wasAttached = true;
    } else if (!button || subscription.wasAttached) {
      subscription.unsubscribe();
      subscriptions.delete(subscription);
    }
  }
};

export const createSoundButton = (
  name: string,
  post: (request: PlaySoundRequest) => void,
  className?: string,
): HTMLButtonElement => {
  const button = element('button', '▶', className);
  const weak = new WeakRef(button);

  pruneRemoved();

  const show = () => {
    const live = weak.deref();

    if (!live) {
      unsubscribe();
      return;
    }

    const { phase, name: shown, error } = pageSoundPlayer.state();
    const active =
      shown === name && (phase === 'loading' || phase === 'playing');
    const failed = shown === name && phase === 'idle' && error;

    live.textContent = active ? '■' : '▶';
    live.title = failed
      ? error
      : `${active ? 'Stop' : 'Play'} ${name}. ${getOpenKeyName()}+click opens the file.`;
  };

  button.onclick = (event) => pageSoundPlayer.press(name, event, post);
  const unsubscribe = pageSoundPlayer.subscribe(show);

  subscriptions.add({ button: weak, unsubscribe, wasAttached: false });

  show();
  return button;
};
