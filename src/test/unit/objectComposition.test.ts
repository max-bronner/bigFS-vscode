import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createSageIniSchema } from '../../formats/ini/sageIniSchema';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { Pose } from '../../formats/w3d/w3dPose';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import {
  composeObject,
  MAX_COMPOSED_PARTS,
  pickDrawLook,
  readRankLine,
} from '../../game/objects/objectComposition';
import type { ComposableObject } from '../../game/objects/objectComposition';
import { readObjectScene } from '../../game/objects/objectScene';
import {
  IDENTITY,
  listPassengerBones,
  placePart,
} from '../../game/objects/placeComposedParts';

const schema = createSageIniSchema(
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'assets', 'sageIniSchema.json'),
      'utf8',
    ),
  ),
);

const toObject = (lines: string[]): ComposableObject => {
  const parsed = parseSageIni(lines, schema);
  const scene = readObjectScene(parsed, schema, () => false, () => false, lines)!;

  return { name: scene.name, parsed, scene };
};

const createSources = (objects: Record<string, string[]>) => ({
  readObject: (name: string) =>
    Promise.resolve(objects[name] ? toObject(objects[name]) : undefined),
  resolveMacro: (name: string) => (name === 'CREW_SIZE' ? '2' : undefined),
});

const CREW = [
  'Object TestCrew',
  '  Draw = W3DHordeModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TC_SKN',
  '    End',
  '    IdleAnimationState',
  '      Animation = Idle',
  '        AnimationName = TC_SKL.TC_IDLA',
  '      End',
  '    End',
  '    AnimationState = PASSENGER PASSENGER_VARIATION_1',
  '      Animation = Push',
  '        AnimationName = TC_SKL.TC_PSHA',
  '      End',
  '    End',
  '    AnimationState = PASSENGER PASSENGER_VARIATION_2',
  '      Animation = PushLeft',
  '        AnimationName = TC_SKL.TC_PSHB',
  '      End',
  '    End',
  '  End',
  '  KindOf = SELECTABLE INFANTRY',
  'End',
];

const RAM = [
  'Object TestRam',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TR_SKN',
  '    End',
  '  End',
  '  Draw = W3DModelDraw ModuleTag_Flag',
  '    AttachToBoneInAnotherModule = FLAGBONE',
  '    DefaultModelConditionState',
  '      Model = TR_FLAG',
  '    End',
  '  End',
  '  Draw = W3DModelDraw ModuleTag_Spikes',
  '    StartHidden = Yes',
  '    DefaultModelConditionState',
  '      Model = TR_SPIKES',
  '    End',
  '  End',
  '  KindOf = SELECTABLE MACHINE',
  '  Behavior = SiegeEngineContain ModuleTag_Contain',
  '    InitialCrew = TestCrew CREW_SIZE',
  '    InitialPayload = TestStowaway 1',
  '    PassengerBonePrefix = PassengerBone:CREWBONE KindOf:INFANTRY',
  '    BoneSpecificConditionState 1 PASSENGER_VARIATION_1',
  '    BoneSpecificConditionState 2 PASSENGER_VARIATION_2',
  '  End',
  'End',
];

const STOWAWAY = [
  'Object TestStowaway',
  '  Draw = W3DModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TS_SKN',
  '    End',
  '  End',
  '  KindOf = SELECTABLE CAVALRY',
  'End',
];

const skeleton = (names: string[], translations: number[][]): SceneSkeleton => ({
  name: 'TEST',
  names,
  parents: names.map((_, at) => (at === 0 ? -1 : 0)),
  translations: translations.flat(),
  rotations: names.flatMap(() => [0, 0, 0, 1]),
});

suite('Object composition', () => {
  test('a contain module seats the occupants its KindOf admits on numbered bones, with their bone conditions', async () => {
    const composition = await composeObject(
      toObject(RAM),
      createSources({ TestCrew: CREW, TestStowaway: STOWAWAY }),
    );
    const crew = composition.parts.filter((part) => part.object === 'TestCrew');

    assert.deepStrictEqual(
      crew.map((part) => [part.placement, part.model, part.animation, part.source.field]),
      [
        [{ kind: 'passengerBone', prefix: 'CREWBONE', slot: 0 }, 'TC_SKN', 'TC_SKL.TC_PSHA', 'InitialCrew'],
        [{ kind: 'passengerBone', prefix: 'CREWBONE', slot: 1 }, 'TC_SKN', 'TC_SKL.TC_PSHB', 'InitialCrew'],
      ],
    );
    assert.ok(!composition.parts.some((part) => part.object === 'TestStowaway'));
    assert.ok(composition.notes.some((note) => /TestStowaway.*not drawn/.test(note)));
  });

  test('a contained horde seats its members, each on the first prefix its KindOf takes', async () => {
    const beast = [
      'Object TestBeast',
      '  Behavior = HordeTransportContain ModuleTag_Contain',
      '    PassengerBonePrefix = PassengerBone:B_DOCK KindOf:HERO',
      '    PassengerBonePrefix = PassengerBone:B_CARGO KindOf:INFANTRY',
      '    InitialPayload = TestCrewHorde 1',
      '  End',
      'End',
    ];
    const crewHorde = [
      'Object TestCrewHorde',
      '  Behavior = HordeContain ModuleTag_Horde',
      '    RankInfo = RankNumber:1 UnitType:TestCrew Position:X:0 Y:10 Position:X:0 Y:-10',
      '  End',
      'End',
    ];
    const { parts } = await composeObject(
      toObject(beast),
      createSources({ TestCrewHorde: crewHorde, TestCrew: CREW }),
    );

    assert.deepStrictEqual(
      parts.map((part) => [part.object, part.placement]),
      [
        ['TestCrew', { kind: 'passengerBone', prefix: 'B_CARGO', slot: 0 }],
        ['TestCrew', { kind: 'passengerBone', prefix: 'B_CARGO', slot: 1 }],
      ],
    );
  });

  test('every draw module naming a model is a part; StartHidden waits and an attachment bone is kept', async () => {
    const { parts } = await composeObject(toObject(RAM), createSources({}));
    const draws = parts.filter((part) => part.draw);

    assert.deepStrictEqual(
      draws.map((part) => [part.draw, part.model, part.placement, part.isShown]),
      [
        ['ModuleTag_Body', 'TR_SKN', { kind: 'origin' }, true],
        ['ModuleTag_Flag', 'TR_FLAG', { kind: 'attachBone', bone: 'FLAGBONE' }, true],
        ['ModuleTag_Spikes', 'TR_SPIKES', { kind: 'origin' }, false],
      ],
    );
  });

  test('a horde fills its slots with its one payload object, centred on the MACHINE rank', async () => {
    const horde = [
      'Object TestRamHorde',
      '  Behavior = HordeContain ModuleTag_Horde',
      '    Slots = 3',
      '    InitialPayload = TestRam 1',
      '    RankInfo = RankNumber:1 UnitType:TestRam Position:X:40 Y:0',
      '    RankInfo = RankNumber:2 UnitType:TestCrew Position:X:10 Y:20 Leader 1 0 Position:X: 10 Y:-20 Position:X:0 Y:0',
      '  End',
      'End',
    ];
    const composition = await composeObject(
      toObject(horde),
      createSources({ TestRam: RAM, TestCrew: CREW, TestStowaway: STOWAWAY }),
    );
    const members = composition.parts.filter((part) => part.parent === undefined);

    assert.deepStrictEqual(
      members.map((part) => [part.object, part.placement]),
      [
        ['TestRam', { kind: 'slot', x: 0, y: 0 }],
        ['TestRam', { kind: 'slot', x: -30, y: 20 }],
        ['TestRam', { kind: 'slot', x: -30, y: -20 }],
      ],
    );
    assert.ok(
      composition.parts.some(
        (part) => part.parent === members[0].id && part.object === 'TestCrew',
      ),
    );
  });

  test('an object reached again through its own parts is refused, and the part count is capped', async () => {
    const loop = [
      'Object TestLoop',
      '  Behavior = HordeContain ModuleTag_Horde',
      '    RankInfo = RankNumber:1 UnitType:TestLoop Position:X:0 Y:0',
      '  End',
      'End',
    ];
    const looped = await composeObject(toObject(loop), createSources({ TestLoop: loop }));

    assert.strictEqual(looped.parts.length, 0);
    assert.ok(looped.notes.some((note) => /reached again/.test(note)));

    const wide = [
      'Object TestWide',
      '  Behavior = HordeContain ModuleTag_Horde',
      `    RankInfo = RankNumber:1 UnitType:TestStowaway ${Array.from({ length: 200 }, (_, at) => `Position:X:${at} Y:0`).join(' ')}`,
      '  End',
      'End',
    ];
    const capped = await composeObject(toObject(wide), createSources({ TestStowaway: STOWAWAY }));

    assert.strictEqual(capped.parts.length, MAX_COMPOSED_PARTS);
    assert.ok(capped.notes.some((note) => /Stopped at/.test(note)));
  });

  test('RankInfo reads every spacing of a position and skips a leader', () => {
    assert.deepStrictEqual(
      readRankLine(['RankNumber:2', 'UnitType:', 'A', 'Position:X:1', 'Y:2', 'Leader', '1', '0', 'Position:', 'X:3', 'Y:4', 'Position:X:', '5', 'Y:', '6', 'Junk']),
      { unitType: 'A', positions: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] },
    );
  });

  test('a draw module shows the state matching most of the conditions held', () => {
    const crew = toObject(CREW);

    assert.deepStrictEqual(pickDrawLook(crew.scene, 'ModuleTag_Draw'), {
      model: 'TC_SKN',
      animation: 'TC_SKL.TC_IDLA',
    });
    assert.strictEqual(
      pickDrawLook(crew.scene, 'ModuleTag_Draw', ['PASSENGER', 'PASSENGER_VARIATION_2']).animation,
      'TC_SKL.TC_PSHB',
    );
  });
});

suite('Composed part placement', () => {
  const bones = skeleton(
    ['ROOT', 'CREWBONE01', 'CREWBONE02', 'FLAGBONE', 'SEAT'],
    [[0, 0, 0], [10, 5, 0], [10, -5, 0], [0, 0, 30], [1, 2, 3]],
  );

  test('passenger bones are numbered from 01 up to the first gap, else the bare prefix', () => {
    assert.deepStrictEqual(listPassengerBones(bones.names, 'crewbone'), [1, 2]);
    assert.deepStrictEqual(listPassengerBones(bones.names, 'SEAT'), [4]);
    assert.deepStrictEqual(listPassengerBones(bones.names, 'NONE'), []);
  });

  test('a passenger sits on its bone, wrapping past the last, and follows the bone as posed', () => {
    const owner = { matrix: IDENTITY, skeleton: bones };
    const third = placePart({ kind: 'passengerBone', prefix: 'CREWBONE', slot: 2 }, owner)!;

    assert.deepStrictEqual(third.slice(12, 15), [10, 5, 0]);

    const pose: Pose = {
      world: [
        { t: [0, 0, 0], q: [0, 0, 0, 1] },
        { t: [10, 5, 7], q: [0, 0, 0, 1] },
        { t: [10, -5, 0], q: [0, 0, 0, 1] },
        { t: [0, 0, 30], q: [0, 0, 0, 1] },
        { t: [1, 2, 3], q: [0, 0, 0, 1] },
      ],
      visible: [true, true, true, true, true],
      opacity: [1, 1, 1, 1, 1],
    };
    const lifted = placePart({ kind: 'passengerBone', prefix: 'CREWBONE', slot: 0 }, { ...owner, pose })!;

    assert.deepStrictEqual(lifted.slice(12, 15), [10, 5, 7]);
    assert.strictEqual(
      placePart({ kind: 'passengerBone', prefix: 'MISSING', slot: 0 }, owner),
      undefined,
    );
  });

  test('a module attached to a bone stands at its bind position; a slot is offset in the owner frame', () => {
    const owner = { matrix: IDENTITY, skeleton: bones };

    assert.deepStrictEqual(
      placePart({ kind: 'attachBone', bone: 'flagbone' }, owner)!.slice(12, 15),
      [0, 0, 30],
    );
    assert.deepStrictEqual(
      placePart({ kind: 'attachBone', bone: 'NOWHERE' }, owner)!.slice(12, 15),
      [0, 0, 0],
    );
    assert.deepStrictEqual(
      placePart({ kind: 'slot', x: 4, y: -2 }, owner)!.slice(12, 15),
      [4, -2, 0],
    );
  });

  test('occupants no seat admits are counted without work per slot', async () => {
    const barracks = [
      'Object TestBarracks',
      '  Draw = W3DModelDraw ModuleTag_Draw',
      '    DefaultModelConditionState',
      '      Model = TB_SKN',
      '    End',
      '  End',
      '  Behavior = OpenContain ModuleTag_Contain',
      '    PassengerBonePrefix = PassengerBone:SEAT KindOf:HERO',
      '    InitialCrew = TestWideHorde 64',
      '  End',
      'End',
    ];
    const wideHorde = [
      'Object TestWideHorde',
      '  Behavior = HordeContain ModuleTag_Horde',
      `    RankInfo = RankNumber:1 UnitType:TestStowaway ${Array.from({ length: 1024 }, (_, at) => `Position:X:${at} Y:0`).join(' ')}`,
      '  End',
      'End',
    ];
    const stowaway = toObject(STOWAWAY);
    let reads = 0;
    const counted = {
      name: stowaway.name,
      scene: stowaway.scene,
      get parsed() {
        reads++;
        return stowaway.parsed;
      },
    };
    const sources = createSources({ TestWideHorde: wideHorde });
    const composition = await composeObject(toObject(barracks), {
      ...sources,
      readObject: (name) =>
        name === 'TestStowaway' ? Promise.resolve(counted) : sources.readObject(name),
    });

    assert.ok(reads <= 1024 + 8, `read the occupant ${reads} times`);
    assert.ok(!composition.parts.some((part) => part.object === 'TestStowaway'));
    assert.ok(composition.notes.some((note) => note.startsWith('65536 × TestStowaway')));
  });

  test('part ids come from where a part is, so an edit elsewhere keeps them', async () => {
    const sources = createSources({ TestCrew: CREW, TestStowaway: STOWAWAY });
    const before = await composeObject(toObject(RAM), sources);
    const extra = [
      '  Draw = W3DModelDraw ModuleTag_Added',
      '    DefaultModelConditionState',
      '      Model = TR_ADDED',
      '    End',
      '  End',
    ];
    const edited = [...RAM.slice(0, 2), ...extra, ...RAM.slice(2)];
    const after = await composeObject(toObject(edited), sources);
    const crewIds = (parts: { id: string; object?: string }[]) =>
      parts.filter((part) => part.object === 'TestCrew').map((part) => part.id);

    assert.strictEqual(new Set(after.parts.map((part) => part.id)).size, after.parts.length);
    assert.deepStrictEqual(crewIds(after.parts), crewIds(before.parts));
    assert.ok(crewIds(before.parts).length === 2);
  });

  test('passenger bones are listed once per skeleton and prefix', () => {
    let searches = 0;
    const names = Object.assign([...bones.names], {
      findIndex(...args: Parameters<string[]['findIndex']>) {
        searches++;
        return Array.prototype.findIndex.apply(this, args);
      },
    });
    const owner = { matrix: IDENTITY, skeleton: { ...bones, names } };
    const seat = { kind: 'passengerBone', prefix: 'CREWBONE', slot: 0 } as const;

    placePart(seat, owner);

    const first = searches;

    placePart({ ...seat, slot: 1 }, owner);
    placePart(seat, owner);
    assert.ok(first > 0);
    assert.strictEqual(searches, first);
  });
});
