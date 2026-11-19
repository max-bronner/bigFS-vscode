import { createSoundPlayer } from './createSoundPlayer';
import { createWebAudioBackend } from './createWebAudioBackend';

export const pageSoundPlayer = createSoundPlayer(createWebAudioBackend());
