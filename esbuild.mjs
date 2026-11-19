import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

let running = 0;

const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      if (running++ === 0) {
        console.log('[watch] build started');
      }
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`[ERROR] ${text}`);

        if (location) {
          console.error(
            `    ${location.file}:${location.line}:${location.column}:`,
          );
        }
      });
      if (--running === 0) {
        console.log('[watch] build finished');
      }
    });
  },
};

const PAGES = [
  { name: 'particles', entry: 'src/webview/particles/main.ts' },
  { name: 'apt', entry: 'src/webview/apt/main.ts' },
  { name: 'armor', entry: 'src/webview/armor/main.ts' },
  { name: 'commandset', entry: 'src/webview/commandset/main.ts' },
  { name: 'model', entry: 'src/webview/preview/main.ts' },
  { name: 'wnd', entry: 'src/webview/wnd/main.ts' },
  { name: 'balanceSheet', entry: 'src/webview/balanceSheet/main.ts' },
  { name: 'sound', entry: 'src/webview/audio/main.ts' },
  { name: 'video', entry: 'src/webview/video/main.ts' },
  { name: 'modDiff', entry: 'src/webview/mods/main.ts' },
  { name: 'map', entry: 'src/webview/map/main.ts' },
  { name: 'cah', entry: 'src/webview/cah/main.ts' },
  { name: 'strings', entry: 'src/webview/strings/main.ts' },
  { name: 'cursors', entry: 'src/webview/cursors/main.ts' },
  { name: 'scripts', entry: 'src/webview/scripts/main.ts' },
  { name: 'archiveSearch', entry: 'src/webview/archiveSearch/main.ts' },
  { name: 'assetCatalogue', entry: 'src/webview/assetCatalogue/main.ts' },
];

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
  const contexts = await Promise.all([
    esbuild.context({
      ...shared,
      entryPoints: ['src/extension.ts'],
      format: 'esm',
      platform: 'node',
      outfile: 'dist/extension.mjs',
      external: ['vscode'],
    }),
    ...PAGES.map(({ name, entry }) =>
      esbuild.context({
        ...shared,
        entryPoints: [entry],
        format: 'iife',
        platform: 'browser',
        outfile: `dist/webview/${name}.js`,
      }),
    ),
  ]);

  for (const each of contexts) {
    if (watch) {
      await each.watch();
    } else {
      await each.rebuild();
      await each.dispose();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
