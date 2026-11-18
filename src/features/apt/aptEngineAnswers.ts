import type { Memento } from 'vscode';
import type { EngineValues } from '../../webview/apt/protocol';
import { movieKey } from './aptLibrary';

export const ENGINE_ANSWERS = 'bigfs.apt.engineAnswers';

export const readEngineAnswers = (
  state: Memento,
): Record<string, EngineValues> =>
  state.get<Record<string, EngineValues>>(ENGINE_ANSWERS, {});

export const keepEngineAnswers = async (
  state: Memento,
  name: string,
  values: EngineValues | undefined,
): Promise<void> => {
  const all = { ...readEngineAnswers(state) };

  if (values) {
    all[movieKey(name)] = values;
  } else {
    delete all[movieKey(name)];
  }
  await state.update(ENGINE_ANSWERS, all);
};
