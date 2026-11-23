import Module from 'module';
import path from 'path';

type Loader = (request: string, ...rest: unknown[]) => unknown;

const OUT_ROOT = path.resolve(__dirname, '..', '..');
const TESTS = path.join(OUT_ROOT, 'test');

export const requireWithVscode = <T>(vscode: unknown, load: () => T): T => {
  const internals = Module as unknown as { _load: Loader };
  const original = internals._load;
  const cache = require.cache;
  const kept = { ...cache };
  const isOwnModule = (key: string) => key.startsWith(OUT_ROOT) && !key.startsWith(TESTS);

  for (const key of Object.keys(cache).filter(isOwnModule)) {
    delete cache[key];
  }
  internals._load = (request, ...rest) =>
    request === 'vscode' ? vscode : original.call(Module, request, ...rest);
  try {
    return load();
  } finally {
    internals._load = original;
    for (const key of Object.keys(cache).filter(isOwnModule)) {
      delete cache[key];
    }
    Object.assign(cache, kept);
  }
};
