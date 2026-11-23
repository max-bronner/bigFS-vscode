import type { ObjectScene } from '../../game/objects/objectScene';
import type { ObjectDefinitionPlace } from './protocol';
import { $, post } from './page';

$('revealDefinition').onclick = () => post({ kind: 'revealDefinition' });
$('effectiveDefinition').onclick = () => post({ kind: 'showEffectiveDefinition' });

export const showObjectHeader = (scene: ObjectScene, place: ObjectDefinitionPlace | undefined): void => {
  const isInherited = !!place?.parent && place.keyword.toLowerCase() !== 'object';
  const kind = [
    place && !isInherited ? place.keyword : undefined,
    isInherited ? `${place!.keyword} of ${place!.parent}` : undefined,
    scene.side,
  ].filter(Boolean);

  $('title').textContent = scene.name;
  $('objectKind').textContent = kind.length ? ` · ${kind.join(' · ')}` : '';
  $('objectSource').textContent = place ? `${place.file}:${place.line + 1}` : '';
  $('revealDefinition').hidden = !place;
  $('effectiveDefinition').hidden = !isInherited;
};
