interface PartSwitch {
  isOn: boolean;
  wasHidden: boolean;
}

export interface PartSwitches {
  readonly overrides: Map<number, boolean>;
  setModel(key: string | undefined): void;
  setHidden(hidden: readonly boolean[], keepsSwitches?: boolean): void;
  switchPart(at: number, isOn: boolean): void;
  hold(): void;
}

export const createPartSwitches = (): PartSwitches => {
  const overrides = new Map<number, boolean>();
  const keptByModel = new Map<string, Map<number, PartSwitch>>();
  let model: string | undefined;
  let switches = new Map<number, PartSwitch>();
  let hidden: readonly boolean[] = [];

  const applySwitches = () => {
    overrides.clear();
    switches.forEach(({ isOn, wasHidden }, at) => {
      if (at < hidden.length && hidden[at] === wasHidden) {
        overrides.set(at, isOn);
      }
    });
  };

  return {
    overrides,
    setModel: (key) => {
      if (key === model) {
        return;
      }
      if (model !== undefined) {
        keptByModel.set(model, switches);
      }
      model = key;
      switches = (key !== undefined && keptByModel.get(key)) || new Map();
      hidden = [];
      applySwitches();
    },
    setHidden: (next, keepsSwitches = false) => {
      if (keepsSwitches) {
        overrides.forEach((isOn, at) => switches.set(at, { isOn, wasHidden: !!next[at] }));
      }
      hidden = next.map(Boolean);
      applySwitches();
    },
    switchPart: (at, isOn) => {
      switches.set(at, { isOn, wasHidden: !!hidden[at] });
      applySwitches();
    },
    hold: () => {
      hidden.forEach((wasHidden, at) =>
        switches.set(at, { isOn: overrides.get(at) ?? !wasHidden, wasHidden }),
      );
      applySwitches();
    },
  };
};
