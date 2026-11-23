import * as assert from 'assert';
import { describeModuleTag, describePartGroup } from '../../webview/particles/describePartGroup';
import type { PartGroup } from '../../game/objects/groupComposedParts';
import type { ComposedPart, PartSource } from '../../game/objects/objectComposition';

const groupOf = (name: string, source: PartSource, extra: Partial<ComposedPart> = {}): PartGroup => ({
  key: name,
  name,
  source: '',
  parts: [
    {
      id: '1',
      source,
      placement: { kind: 'origin' },
      subObjectRules: [],
      isShown: true,
      ...extra,
    },
  ],
});

suite('Composition labels', () => {
  test('a draw module tag is written as words', () => {
    assert.strictEqual(describeModuleTag('ModuleTag_DrawDoor'), 'Door');
    assert.strictEqual(describeModuleTag('ModuleTag_Banner_Draw02'), 'Banner 02');
    assert.strictEqual(describeModuleTag('ModuleTag_IceWalls'), 'Ice walls');
    assert.strictEqual(describeModuleTag('ModuleTag_BaseDraw'), 'Base');
    assert.strictEqual(describeModuleTag('ModuleTag_HCBanner'), 'HC banner');
  });

  test('a tag with no words in it is kept as written', () => {
    assert.strictEqual(describeModuleTag('ModuleTag_04'), 'ModuleTag_04');
    assert.strictEqual(describeModuleTag('ModuleTag_Draw'), 'ModuleTag_Draw');
  });

  test("the previewed object's own module is named by its type alone", () => {
    const label = describePartGroup(
      groupOf(
        'ModuleTag_DrawDoor',
        { owner: 'TestFortress', moduleType: 'W3DScriptedModelDraw', moduleTag: 'ModuleTag_DrawDoor', field: 'Draw' },
        { draw: 'ModuleTag_DrawDoor' },
      ),
      'testfortress',
    );

    assert.deepStrictEqual(label, { title: 'Door', detail: 'W3DScriptedModelDraw' });
  });

  test('an object keeps its name, and a part of a part says whose it is', () => {
    const crew = describePartGroup(
      groupOf(
        'TestCrew',
        { owner: 'TestRam', moduleType: 'TransportContain', moduleTag: 'ModuleTag_Crew', field: 'InitialPayload' },
        { object: 'TestCrew' },
      ),
      'TestRam',
    );
    const rider = describePartGroup(
      groupOf(
        'TestRider',
        { owner: 'TestCrew', moduleType: 'RiderChangeContain', field: 'Rider1' },
        { object: 'TestRider' },
      ),
      'TestRam',
    );

    assert.deepStrictEqual(crew, {
      title: 'TestCrew',
      detail: 'InitialPayload of TransportContain ModuleTag_Crew',
    });
    assert.deepStrictEqual(rider, { title: 'TestRider', detail: 'Rider1 of RiderChangeContain in TestCrew' });
  });
});
