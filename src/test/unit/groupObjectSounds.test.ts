import * as assert from 'assert';
import { describeSoundField, groupObjectSounds } from '../../game/audio/groupObjectSounds';

suite('Object sounds by occasion', () => {
  test('a field is written as words', () => {
    assert.strictEqual(describeSoundField('VoiceAttackStructure'), 'Attack structure');
    assert.strictEqual(describeSoundField('VoiceEnterStateMove'), 'Move, as it starts');
    assert.strictEqual(describeSoundField('VoiceEnter'), 'Enter');
    assert.strictEqual(describeSoundField('Sound'), 'Sound');
  });

  test('sounds go to when they play, in a fixed order, none lost', () => {
    const fields = [
      'Sound',
      'EvaEventDieOwner',
      'VoiceAttackCharge',
      'VoiceMoveWhileAttacking',
      'VoiceEnterStateAttack',
      'VoiceEnterUnitMordorMumakil',
      'VoiceSelect',
      'SoundOnReallyDamaged',
      'SoundAmbientDamaged',
    ];
    const groups = groupObjectSounds(fields.map((field) => ({ field, name: `Test${field}` })));

    assert.deepStrictEqual(
      groups.map(({ title, sounds }) => [title, sounds.map((sound) => sound.field)]),
      [
        ['Selected', ['VoiceSelect']],
        ['Ordered to move', ['VoiceMoveWhileAttacking']],
        ['Ordered to attack', ['VoiceAttackCharge', 'VoiceEnterStateAttack']],
        ['Ordered to guard, garrison or enter', ['VoiceEnterUnitMordorMumakil']],
        ['Hurt, hit or dying', ['SoundOnReallyDamaged']],
        ['Ambient', ['SoundAmbientDamaged']],
        ['Announcer', ['EvaEventDieOwner']],
        ['Other', ['Sound']],
      ],
    );
  });

  test('a bare Sound field goes by its module', () => {
    assert.deepStrictEqual(
      groupObjectSounds([{ field: 'Sound', name: 'TestDie', module: 'SlowDeathBehavior' }]),
      [
        {
          title: 'Hurt, hit or dying',
          sounds: [
            { field: 'Sound', name: 'TestDie', module: 'SlowDeathBehavior', label: 'Slow death behavior' },
          ],
        },
      ],
    );
  });
});
