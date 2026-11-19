import * as vscode from 'vscode';
import {
  checkScript,
  decompileBlock,
  findBlockPointers,
} from '../../formats/apt/aptScript';
import type { AptDocument } from './aptDocument';
import { createKeyedDebouncer } from '../../core/debounce';

const CHECK_DELAY_MS = 250;

export const SCRIPT_SCHEME = 'bigfs-apt-script';

export interface ScriptHost {
  document(movie: string): AptDocument | undefined;
  save(document: AptDocument, block: number, text: string): Promise<number>;
}

const encoder = new TextEncoder();

export class AptScripts
  implements vscode.FileSystemProvider, vscode.Disposable
{
  private readonly changes = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  public readonly onDidChangeFile = this.changes.event;

  private readonly blocks = new Map<string, number[]>();
  private readonly diagnostics =
    vscode.languages.createDiagnosticCollection('apt-script');
  private readonly subscriptions: vscode.Disposable[];

  public constructor(private readonly host: ScriptHost) {
    const check = (document: vscode.TextDocument) => {
      if (document.uri.scheme === SCRIPT_SCHEME) {
        this.check(document);
      }
    };

    const checkSoon = createKeyedDebouncer(
      check,
      CHECK_DELAY_MS,
      (document: vscode.TextDocument) => document.uri.toString(),
    );

    this.subscriptions = [
      this.changes,
      this.diagnostics,
      { dispose: checkSoon.dispose },
      vscode.workspace.registerFileSystemProvider(SCRIPT_SCHEME, this, {
        isCaseSensitive: true,
      }),
      vscode.workspace.onDidOpenTextDocument(check),
      vscode.workspace.onDidChangeTextDocument(({ document }) =>
        checkSoon.schedule(document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => {
        checkSoon.cancel(document.uri.toString());
        this.diagnostics.delete(document.uri);
      }),
    ];
  }

  public dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public static getScriptUri(
    document: AptDocument,
    block: number,
    label: string,
  ): vscode.Uri {
    const tab = label.replace(/[^\w #.@-]+/g, ' ').trim() || `block ${block}`;

    return vscode.Uri.from({
      scheme: SCRIPT_SCHEME,
      path: `/${document.name}/${tab}.aptscript`,
      query: new URLSearchParams({
        movie: document.uri.toString(),
        block: String(block),
      }).toString(),
    });
  }

  public async open(
    document: AptDocument,
    block: number,
    label: string,
  ): Promise<vscode.Uri> {
    const uri = AptScripts.getScriptUri(document, block, label);

    this.blocks.set(uri.toString(), [block]);
    await vscode.window.showTextDocument(
      await vscode.languages.setTextDocumentLanguage(
        await vscode.workspace.openTextDocument(uri),
        'apt-script',
      ),
      { preview: false },
    );
    return uri;
  }

  public notifyChanged(document: AptDocument): void {
    const events = [...this.blocks.keys()]
      .map((key) => vscode.Uri.parse(key))
      .filter((uri) => this.parseTarget(uri).movie === document.uri.toString())
      .map((uri) => ({ type: vscode.FileChangeType.Changed, uri }));

    if (events.length) {
      this.changes.fire(events);
    }
  }

  private parseTarget(uri: vscode.Uri): { movie: string; blocks: number[] } {
    const query = new URLSearchParams(uri.query);

    return {
      movie: query.get('movie') ?? '',
      blocks: this.blocks.get(uri.toString()) ?? [Number(query.get('block'))],
    };
  }

  private resolve(uri: vscode.Uri): { document: AptDocument; block: number } {
    const { movie, blocks } = this.parseTarget(uri);
    const document = this.host.document(movie);
    const block =
      document &&
      [...blocks]
        .reverse()
        .find(
          (each) =>
            findBlockPointers(
              document.image.bytes,
              document.constFile.movieOffset,
              each,
            ).length,
        );

    if (!document || block === undefined || !Number.isInteger(block)) {
      throw vscode.FileSystemError.FileNotFound(
        `${uri.path.slice(1)}: open its movie in the APT editor first`,
      );
    }
    return { document, block };
  }

  private decompileScript(uri: vscode.Uri) {
    return this.decompileResolved(this.resolve(uri));
  }

  private decompileResolved({
    document,
    block,
  }: {
    document: AptDocument;
    block: number;
  }) {
    return decompileBlock(
      document.image.bytes,
      block,
      document.constFile.items,
    );
  }

  private check(text: vscode.TextDocument): void {
    try {
      const { document } = this.resolve(text.uri);
      const problem = checkScript(text.getText(), document.constFile.items);

      if (!problem) {
        this.diagnostics.delete(text.uri);
        return;
      }

      const line = Math.max(0, (problem.line ?? 1) - 1);
      const column = Math.max(0, (problem.column ?? 1) - 1);
      const end = text.lineAt(Math.min(line, text.lineCount - 1)).range.end;

      this.diagnostics.set(text.uri, [
        new vscode.Diagnostic(
          new vscode.Range(
            line,
            column,
            end.line,
            Math.max(end.character, column + 1),
          ),
          problem.message,
          vscode.DiagnosticSeverity.Error,
        ),
      ]);
    } catch {
      this.diagnostics.delete(text.uri);
    }
  }

  public stat(uri: vscode.Uri): vscode.FileStat {
    const resolved = this.resolve(uri);
    const script = this.decompileResolved(resolved);

    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: resolved.document.version,
      size: encoder.encode(script.text).length,
      permissions:
        script.mode === 'listing'
          ? vscode.FilePermission.Readonly
          : undefined,
    };
  }

  public readFile(uri: vscode.Uri): Uint8Array {
    return encoder.encode(this.decompileScript(uri).text);
  }

  public async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const { document, block } = this.resolve(uri);

    if (this.decompileResolved({ document, block }).mode === 'listing') {
      throw vscode.FileSystemError.NoPermissions(
        'This block only shows as a listing and cannot be compiled back',
      );
    }

    const text = new TextDecoder().decode(content);
    const problem = checkScript(text, document.constFile.items);

    if (problem) {
      throw vscode.FileSystemError.Unavailable(
        `${problem.line ? `line ${problem.line}: ` : ''}${problem.message}`,
      );
    }
    const saved = await this.host.save(document, block, text);

    this.blocks.set(uri.toString(), [...this.parseTarget(uri).blocks, saved]);
    this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  public watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  public readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  public createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('Scripts live in their movie');
  }

  public delete(): void {
    throw vscode.FileSystemError.NoPermissions(
      'Remove a script from the APT editor',
    );
  }

  public rename(): void {
    throw vscode.FileSystemError.NoPermissions('Scripts live in their movie');
  }
}
