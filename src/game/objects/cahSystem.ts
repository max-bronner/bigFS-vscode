import type { SageBlock, SageDocument } from "../../formats/ini/sageIniParser";

export interface IniBlock {
  keyword: string;
  values: string[];
  fields: Map<string, string[][]>;
  children: IniBlock[];
}

const readBlock = (block: SageBlock, document: SageDocument): IniBlock => {
  const header = document.statements.find(
    (statement) => statement.block === block,
  );
  const fields = new Map<string, string[][]>();

  for (const statement of document.statements) {
    const inside =
      statement.kind === "field" &&
      statement.line > block.startLine &&
      statement.line < block.endLine &&
      !block.children.some(
        (child) =>
          statement.line >= child.startLine && statement.line <= child.endLine,
      );

    if (inside) {
      const key = statement.keyword.text.toLowerCase();
      const lines = fields.get(key) ?? [];

      lines.push(statement.values.map((value) => value.text));
      fields.set(key, lines);
    }
  }

  return {
    keyword: block.keyword,
    values: header?.values.map((value) => value.text) ?? [],
    fields,
    children: block.children.map((child) => readBlock(child, document)),
  };
};

export const readBlockAtLine = (
  document: SageDocument,
  line: number,
): IniBlock | undefined => {
  const find = (blocks: SageBlock[]): SageBlock | undefined => {
    for (const block of blocks) {
      if (block.startLine === line) {
        return block;
      }

      const inner = find(block.children);

      if (inner) {
        return inner;
      }
    }
    return undefined;
  };
  const block = find(document.blocks);

  return block && readBlock(block, document);
};

export const readTopBlocks = (
  document: SageDocument,
  keyword: string,
): IniBlock[] =>
  document.blocks
    .filter((block) => block.keyword.toLowerCase() === keyword.toLowerCase())
    .map((block) => readBlock(block, document));

const readFirstValue = (block: IniBlock, key: string): string | undefined => {
  const value = block.fields.get(key.toLowerCase())?.[0]?.[0];

  return value && value.toLowerCase() !== "none" ? value : undefined;
};

const words = (block: IniBlock, key: string): string[] =>
  (block.fields.get(key.toLowerCase()) ?? [])
    .flat()
    .filter((word) => word.toLowerCase() !== "none");

export const parseIniColor = (tokens: string[]): number | undefined => {
  const part = (tag: string): number | undefined => {
    const token = tokens.find((candidate) =>
      candidate.toUpperCase().startsWith(`${tag}:`),
    );
    const value = token ? Number(token.slice(2)) : NaN;

    return Number.isInteger(value) && value >= 0 && value <= 255
      ? value
      : undefined;
  };
  const red = part("R");
  const green = part("G");
  const blue = part("B");
  const alpha = tokens.some((token) => token.toUpperCase().startsWith("A:"))
    ? part("A")
    : 255;

  return red === undefined ||
    green === undefined ||
    blue === undefined ||
    alpha === undefined
    ? undefined
    : ((alpha << 24) | (red << 16) | (green << 8) | blue) >>> 0;
};

export interface HeroBling {
  upgrade?: string;
  nameTag?: string;
  group?: string;
}

export interface HeroBinder {
  group?: string;
  labelTag?: string;
  slot?: number;
  isAttribute: boolean;
}

export interface HeroAttribute {
  group?: string;
  minUpgrade?: string;
  maxUpgrade?: string;
  defaultUpgrade?: string;
}

export interface HeroSubclass {
  upgrade?: string;
  nameTag?: string;
  iconImage?: string;
  points?: number;
  colors: (number | undefined)[];
  blingUpgrades: string[];
  attributes: HeroAttribute[];
}

export interface HeroClass {
  upgrade?: string;
  nameTag?: string;
  iconImage?: string;
  subclasses: HeroSubclass[];
}

export interface HeroSystem {
  classes: HeroClass[];
  binders: HeroBinder[];
  blings: HeroBling[];
}

const readSubclass = (block: IniBlock): HeroSubclass => ({
  upgrade: readFirstValue(block, "UpgradeName"),
  nameTag: readFirstValue(block, "NameTag"),
  iconImage: readFirstValue(block, "IconImage"),
  points: Number.isInteger(Number(readFirstValue(block, "SpendableAttributePoints")))
    ? Number(readFirstValue(block, "SpendableAttributePoints"))
    : undefined,
  colors: [
    "DefaultPrimaryColor",
    "DefaultSecondaryColor",
    "DefaultTertiaryColor",
  ].map((key) => {
    const line = block.fields.get(key.toLowerCase())?.[0];

    return line && parseIniColor(line);
  }),
  blingUpgrades: words(block, "BlingUpgrades").map((name) =>
    name.startsWith("@") ? name.slice(1) : name,
  ),
  attributes: block.children
    .filter((child) => child.keyword.toLowerCase() === "attribute")
    .map((attribute) => ({
      group: readFirstValue(attribute, "GroupName"),
      minUpgrade: readFirstValue(attribute, "MinValueUpgrade"),
      maxUpgrade: readFirstValue(attribute, "MaxValueUpgrade"),
      defaultUpgrade: readFirstValue(attribute, "DefaultValueUpgrade"),
    })),
});

export const readHeroSystem = (systems: IniBlock[]): HeroSystem => {
  const system: HeroSystem = { classes: [], binders: [], blings: [] };

  for (const block of systems) {
    for (const child of block.children) {
      switch (child.keyword.toLowerCase()) {
        case "createaherobling":
          system.blings.push({
            upgrade: readFirstValue(child, "BlingUpgradeName"),
            nameTag: readFirstValue(child, "NameTag"),
            group: readFirstValue(child, "GroupName"),
          });
          break;
        case "createaheroblingbinder":
          system.binders.push({
            group: readFirstValue(child, "GroupName"),
            labelTag: readFirstValue(child, "LabelTag"),
            slot: Number.isInteger(Number(readFirstValue(child, "UISlot")))
              ? Number(readFirstValue(child, "UISlot"))
              : undefined,
            isAttribute:
              readFirstValue(child, "BlingType")?.toUpperCase() === "ATTRIBUTE",
          });
          break;
        case "createaheroclass":
          system.classes.push({
            upgrade: readFirstValue(child, "UpgradeName"),
            nameTag: readFirstValue(child, "NameTag"),
            iconImage: readFirstValue(child, "IconImage"),
            subclasses: child.children
              .filter((sub) => sub.keyword.toLowerCase() === "subclass")
              .map(readSubclass),
          });
          break;
      }
    }
  }
  return system;
};

const isSameName = (a: string | undefined, b: string | undefined): boolean =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

export const listBlingOptions = (
  system: HeroSystem,
  subclass: HeroSubclass | undefined,
  group: string,
  groupOrder: (upgrade: string) => number | undefined,
): string[] => {
  const inGroup = system.blings.filter((bling) => isSameName(bling.group, group));
  const named = new Set(
    (subclass?.blingUpgrades ?? []).map((name) => name.toLowerCase()),
  );
  const isAttribute = subclass?.attributes.some((a) => isSameName(a.group, group));
  const chosen = inGroup.filter(
    (bling) =>
      isAttribute ||
      (bling.upgrade !== undefined && named.has(bling.upgrade.toLowerCase())),
  );
  const options = (chosen.length || !subclass ? chosen : []).flatMap(
    (bling, order) =>
      bling.upgrade
        ? [
            {
              upgrade: bling.upgrade,
              key: groupOrder(bling.upgrade) ?? 0,
              order,
            },
          ]
        : [],
  );

  return options
    .sort((a, b) => a.key - b.key || a.order - b.order)
    .map((option) => option.upgrade);
};

export const countSpentPoints = (
  system: HeroSystem,
  subclass: HeroSubclass | undefined,
  blings: { group: string; index: number }[],
  groupOrder: (upgrade: string) => number | undefined,
): number => {
  let spent = 0;

  for (const attribute of subclass?.attributes ?? []) {
    const bling = blings.find((entry) => isSameName(entry.group, attribute.group));

    if (!bling || !attribute.group) {
      continue;
    }

    const options = listBlingOptions(system, subclass, attribute.group, groupOrder);
    const min = Math.max(
      0,
      options.findIndex((option) => isSameName(option, attribute.minUpgrade)),
    );

    spent += Math.max(0, bling.index - min);
  }
  return spent;
};
