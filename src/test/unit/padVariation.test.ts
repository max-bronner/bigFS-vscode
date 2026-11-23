import * as assert from 'assert';
import { readPadVariation } from '../../game/objects/padVariation';
import type { DefinitionName, PadLookup } from '../../game/objects/padVariation';

const createLookup = (
  users: Record<string, DefinitionName[]>,
  objects: Record<string, string[]>,
): PadLookup => ({
  findUsers: async (namespace, name) => users[`${namespace}/${name}`] ?? [],
  findObjectLines: async (name) => objects[name],
});

const PADS = {
  CornerPad: [
    'Object CornerPad',
    '  Behavior = FoundationAIUpdate ModuleTag_Foundation',
    '    BuildVariation = 2 ; corner towers',
    '  End',
    'End',
  ],
  SidePad: ['ChildObject SidePad CornerPad', '  Behavior = FoundationAIUpdate ModuleTag_Foundation', '    BuildVariation = 1', '  End', 'End'],
  CopyPad: ['ChildObject CopyPad CornerPad', 'End'],
};

suite('Pad variation', () => {
  test('an expansion sold only on corner pads holds their variation, also through a ChildObject pad', async () => {
    const lookup = createLookup(
      {
        'Object/TowerExpansion': [{ keyword: 'CommandButton', name: 'Command_BuildTower' }],
        'CommandButton/Command_BuildTower': [{ keyword: 'CommandSet', name: 'CornerSet' }],
        'CommandSet/CornerSet': [
          { keyword: 'Object', name: 'CornerPad' },
          { keyword: 'ChildObject', name: 'CopyPad' },
        ],
      },
      PADS,
    );

    assert.strictEqual(await readPadVariation('TowerExpansion', lookup), 'BUILD_VARIATION_TWO');
  });

  test('pads that disagree, or none at all, leave the variation open', async () => {
    const lookup = createLookup(
      {
        'Object/ArrowTower': [{ keyword: 'CommandButton', name: 'Command_BuildArrows' }],
        'CommandButton/Command_BuildArrows': [
          { keyword: 'CommandSet', name: 'CornerSet' },
          { keyword: 'CommandSet', name: 'SideSet' },
        ],
        'CommandSet/CornerSet': [{ keyword: 'Object', name: 'CornerPad' }],
        'CommandSet/SideSet': [{ keyword: 'ChildObject', name: 'SidePad' }],
      },
      PADS,
    );

    assert.strictEqual(await readPadVariation('ArrowTower', lookup), undefined);
    assert.strictEqual(await readPadVariation('Farm', lookup), undefined);
  });
});
