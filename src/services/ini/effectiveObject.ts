import type * as vscode from 'vscode';
import { composeLineage } from '../../game/objects/effectiveObject';
import type { LineageStep } from '../../game/objects/effectiveObject';
import {
  parseSageIni,
  stripComment,
  tokenize,
} from '../../formats/ini/sageIniParser';
import type { SageIniDocuments } from './sageIniDocuments';
import type { SageIniIndex } from './sageIniIndex';
import { readWorkspaceText } from './workspaceText';

const TEMPLATES = ['Object', 'ChildObject', 'ObjectReskin'];
const INHERITING = ['childobject', 'objectreskin'];
const MAX_DEPTH = 8;

export const parseTemplateHeader = (line: string) => {
  const [keyword, name, parent] = tokenize(stripComment(line));

  return {
    keyword: keyword?.text ?? '',
    name: name?.text ?? '',
    parent: INHERITING.includes(keyword?.text.toLowerCase() ?? '')
      ? parent?.text
      : undefined,
  };
};

export const composeEffectiveObject = async (
  documents: SageIniDocuments,
  index: SageIniIndex,
  source: vscode.Uri,
  line: number,
): Promise<string | undefined> => {
  const step = async (
    uri: vscode.Uri,
    at: number,
  ): Promise<
    (LineageStep & { parent?: string; header: string }) | undefined
  > => {
    const lines = (await readWorkspaceText(uri)).split(/\r?\n/);
    const parsed = parseSageIni(lines, await documents.getSchema());
    const block = parsed.blocks.find((each) => each.startLine === at);

    if (!block) {
      return undefined;
    }

    const header = parseTemplateHeader(lines[at]);

    return {
      name: header.name,
      lines,
      block,
      statements: parsed.statements,
      parent: header.parent,
      header: lines[at].trim(),
    };
  };
  const find = async (name: string) => {
    await index.whenReady();
    for (const keyword of TEMPLATES) {
      const [place] = index.findDefinitions(keyword, name, source);

      if (place) {
        return place;
      }
    }
    return undefined;
  };
  const first = await step(source, line);

  if (!first) {
    return undefined;
  }

  const lineage = [first];
  const notes: string[] = [];

  for (let parent = first.parent, depth = 0; parent; depth++) {
    if (depth >= MAX_DEPTH) {
      notes.push(`; Stopped after ${MAX_DEPTH} parents`);
      break;
    }

    const place = await find(parent);
    const next = place && (await step(place.uri, place.line));

    if (!next) {
      notes.push(
        `; ${parent} is not defined anywhere indexed: shown without it`,
      );
      break;
    }
    if (
      lineage.some(
        (each) => each.name.toLowerCase() === next.name.toLowerCase(),
      )
    ) {
      notes.push(`; ${next.name} inherits from itself: stopped there`);
      break;
    }
    lineage.unshift(next);
    parent = next.parent;
  }
  return [...notes, composeLineage(lineage, first.header)].join('\n');
};
