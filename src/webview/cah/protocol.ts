export interface ChoiceView {
  index: number;
  label: string;
}

export interface PowerView {
  slot: number;
  button: string;
  level: number;
  commandSlot: number;
  label?: string;
  specialPower?: string;
  specialPowerKnown?: boolean;
  buttonKnown?: boolean;
}

export interface BlingView {
  at: number;
  group: string;
  index: number;
  binder?: string;
  kind: string;
  upgrade?: string;
  label?: string;
}

export interface HeroView {
  kind: 'hero';
  readOnly: boolean;
  hasSystem: boolean;
  name: string;
  id: string | undefined;
  isSystem: boolean | undefined;
  version: number;
  objectId: number;
  classIndex: number;
  subclassIndex: number;
  classes: ChoiceView[];
  subclasses: ChoiceView[];
  colors: { hex: string; alpha: number }[];
  points: { total: number | undefined; spent: number } | undefined;
  powers: PowerView[];
  blings: BlingView[];
  file: {
    storedCrc: number | undefined;
    document: boolean;
    crc: number;
    trailing: number;
  };
}

export interface CahNotice {
  kind: 'notice';
  message: string;
}

export type CahToPage = HeroView | CahNotice;

export type FromCahPage =
  | { kind: 'ready' }
  | {
      kind: 'setName' | 'setId' | 'setClass' | 'setSubclass';
      value: string;
    }
  | { kind: 'setColor'; index: number; value: string }
  | {
      kind: 'setPower';
      index: number;
      field: 'button' | 'level' | 'slot';
      value: string;
    }
  | { kind: 'clearPower'; index: number }
  | { kind: 'addBling'; value: string }
  | { kind: 'removeBling'; index: number }
  | {
      kind: 'setBling';
      index: number;
      field: 'group' | 'index';
      value: string;
    };
