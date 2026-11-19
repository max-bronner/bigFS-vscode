import * as vscode from 'vscode';
import { runLatest } from '../../core/runLatest';
import type { ToolBox } from '../../core/toolRegistry';
import type { EntryLocator } from '../../services/entryLocator';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { AptEdit, EditResult } from '../../formats/apt/writer/aptEdit';
import { isEditable } from '../../services/ini/archiveText';
import type { ToPage } from '../../webview/apt/protocol';
import { AptDocument } from './aptDocument';
import { addScript, editDocument, editScript } from './aptDocumentEdits';
import type { RecordChange, ScriptSite } from './aptDocumentEdits';
import { AptLibrary } from './aptLibrary';
import { dispatchPageMessage } from './aptMessages';
import { createAptMovieImports } from './aptMovieImports';
import type { AptGameServices, AptMovieImports } from './aptMovieImports';
import { renderAptPage } from './aptPage';
import { AptScripts } from './aptScripts';
import { AptSelections } from './aptSelections';
import { AptTextView } from './aptTextView';
import { checkAptDocument } from './aptWorkspaceCheck';
import { APT_VIEW_TYPE } from './viewTypes';

export class AptEditorProvider
  implements vscode.CustomEditorProvider<AptDocument>, vscode.Disposable
{
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<AptDocument>
  >();

  public readonly onDidChangeCustomDocument = this.onDidChangeEmitter.event;

  public readonly problems = vscode.languages.createDiagnosticCollection('apt');

  private readonly redraws = new Map<AptDocument, () => Promise<void>>();

  private readonly open = new Map<string, AptDocument>();

  private readonly pagesReady = new Set<AptDocument>();

  private readonly imported = new Map<
    AptDocument,
    { unresolved: string[]; origins: Record<string, string> }
  >();

  private readonly selections = new AptSelections();

  private readonly scripts: vscode.Uri;

  private readonly library: AptLibrary;

  private readonly imports: AptMovieImports;

  private readonly scriptTabs: AptScripts;

  private readonly textView: AptTextView;

  private readonly disposables: vscode.Disposable[];

  public constructor(
    private readonly tools: ToolBox,
    private readonly locator: EntryLocator,
    archiveModel: ArchiveModel,
    extensionUri: vscode.Uri,
    private readonly game: AptGameServices,
  ) {
    this.scripts = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    this.library = new AptLibrary(archiveModel);
    this.imports = createAptMovieImports({
      library: this.library,
      game,
      findDocument: (key) => this.open.get(key),
      load: (uri) => AptDocument.open(uri, locator, tools),
    });
    this.library.onDidChange(() => {
      this.imports.forget();
      this.redrawAll();
    });
    this.scriptTabs = new AptScripts({
      document: (movie) => this.open.get(movie),
      save: (document, block, text) =>
        editScript(this.record, document, block, text),
    });
    this.textView = new AptTextView({
      document: (movie) => this.open.get(movie),
      load: (movie) => AptDocument.open(movie, locator, tools),
      commit: async (document, saved) => {
        await this.record(document, 'text', async () =>
          document.restore({
            apt: saved.apt,
            constBytes: saved.constBytes,
            files: document.files,
          }),
        );
        if (!(await vscode.workspace.save(document.uri))) {
          await document.save();
        }
      },
      isReadOnly: (movie) => !isEditable(archiveModel, movie),
    });
    this.disposables = [
      game.gameLanguage.onDidChange(() => this.redrawAll()),
      this.scriptTabs,
      this.textView,
      this.problems,
      this.library,
    ];
  }

  public static register(
    tools: ToolBox,
    locator: EntryLocator,
    archiveModel: ArchiveModel,
    extensionUri: vscode.Uri,
    game: AptGameServices,
  ): AptEditorProvider {
    const provider = new AptEditorProvider(
      tools,
      locator,
      archiveModel,
      extensionUri,
      game,
    );

    provider.disposables.push(
      vscode.window.registerCustomEditorProvider(APT_VIEW_TYPE, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }),
    );
    return provider;
  }

  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }

  public findDocument(key: string): AptDocument | undefined {
    return this.open.get(key);
  }

  public isPageReady(document: AptDocument): boolean {
    return this.pagesReady.has(document);
  }

  public getShownImports(
    document: AptDocument,
  ): { unresolved: string[]; origins: Record<string, string> } | undefined {
    return this.imported.get(document);
  }

  public async redraw(document: AptDocument): Promise<void> {
    await this.redraws.get(document)?.();
  }

  public edit(document: AptDocument, edit: AptEdit): Promise<EditResult> {
    return editDocument(this.record, document, edit);
  }

  public addScript(document: AptDocument, site: ScriptSite): Promise<number> {
    return addScript(this.record, document, site);
  }

  public openScript(
    document: AptDocument,
    block: number,
    label: string,
  ): Promise<vscode.Uri> {
    return this.scriptTabs.open(document, block, label);
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    context: vscode.CustomDocumentOpenContext,
  ): Promise<AptDocument> {
    const document = await AptDocument.open(uri, this.locator, this.tools);

    if (context.backupId) {
      document.restoreBackup(
        await vscode.workspace.fs.readFile(vscode.Uri.parse(context.backupId)),
      );
    }

    return document;
  }

  public async saveCustomDocument(document: AptDocument): Promise<void> {
    await document.save();
  }

  public async saveCustomDocumentAs(
    document: AptDocument,
    destination: vscode.Uri,
  ): Promise<void> {
    await document.save(destination);
  }

  public async revertCustomDocument(document: AptDocument): Promise<void> {
    const fresh = await AptDocument.open(
      document.uri,
      this.locator,
      this.tools,
    );

    document.restore(fresh.snapshot());
    await this.redraws.get(document)?.();
  }

  public async backupCustomDocument(
    document: AptDocument,
    context: vscode.CustomDocumentBackupContext,
  ): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(context.destination, document.backup());

    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination),
    };
  }

  private readonly record: RecordChange = async (document, label, change) => {
    const before = document.snapshot();
    let result;

    try {
      result = await change();
    } catch (error) {
      document.restore(before);
      throw error;
    }

    const after = document.snapshot();
    const redraw = async () => {
      await this.redrawAll();
      this.scriptTabs.notifyChanged(document);
      this.textView.changed(document.uri);
    };

    this.onDidChangeEmitter.fire({
      document,
      label,
      undo: async () => {
        document.restore(before);
        await redraw();
      },
      redo: async () => {
        document.restore(after);
        await redraw();
      },
    });
    await redraw();

    return result;
  };

  private redrawAll(): Promise<void> {
    return Promise.all(
      [...this.redraws.values()].map((redraw) => redraw().catch(() => {})),
    ).then(() => undefined);
  }

  public async resolveCustomEditor(
    document: AptDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.scripts],
    };
    panel.webview.html = renderAptPage(
      panel.webview,
      panel.webview.asWebviewUri(vscode.Uri.joinPath(this.scripts, 'apt.js')),
    );

    const sentTextures = new Set<string>();
    const sentMovies = new Map<string, string>();
    let isDisposed = false;
    let hasLoaded!: () => void;
    const loaded = new Promise<void>((resolve) => (hasLoaded = resolve));
    const post = async (message: ToPage): Promise<boolean> => {
      await loaded;
      return !isDisposed && (await panel.webview.postMessage(message));
    };
    const say = (text: string) => void post({ kind: 'progress', text });
    let isDrawn = false;

    const redraw = runLatest(async () => {
      const isFirst = !isDrawn;
      const message = await this.imports.buildMovieMessage(
        document,
        sentTextures,
        sentMovies,
        isFirst
          ? { status: say, early: async (early) => void (await post(early)) }
          : undefined,
      );

      isDrawn = true;
      this.imported.set(document, {
        unresolved: message.unresolved,
        origins: message.origins,
      });
      await post(message);
      await this.selections.markDrawn(
        document.uri.toString(),
        async (character) => void (await post({ kind: 'select', character })),
      );
      if (isFirst) {
        say('Checking the movie…');
      }

      const problems = await checkAptDocument(
        this.problems,
        document,
        message.unresolved,
      );

      await post({ kind: 'integrity', problems });
      if (isFirst) {
        say('');
      }
    });

    this.redraws.set(document, redraw);
    this.open.set(document.uri.toString(), document);

    const firstDraw = redraw();

    firstDraw.catch(() => undefined);

    let isFirstReady = true;
    const subscription = panel.webview.onDidReceiveMessage((message) =>
      dispatchPageMessage(message, {
        document,
        post,
        sentTextures,
        sentMovies,
        record: this.record,
        ready: async () => {
          this.pagesReady.add(document);
          hasLoaded();
          if (isFirstReady) {
            isFirstReady = false;
            await firstDraw;
          } else {
            await redraw();
          }
        },
        imports: this.imports,
        library: this.library,
        selections: this.selections,
        tools: this.tools,
        game: this.game,
        locator: this.locator,
        scriptTabs: this.scriptTabs,
        textView: this.textView,
      }),
    );

    panel.onDidDispose(() => {
      isDisposed = true;
      hasLoaded();
      subscription.dispose();
      this.redraws.delete(document);
      this.open.delete(document.uri.toString());
      this.textView.changed(document.uri);
      this.pagesReady.delete(document);
      this.selections.forget(document.uri.toString());
      this.imported.delete(document);
    });
  }
}
