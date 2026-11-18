import { EventEmitter, Uri, workspace } from 'vscode';
import type { Disposable, TextDocument } from 'vscode';
import { createSageIniSchema } from '../../formats/ini/sageIniSchema';
import type { SageGame, SageIniSchema } from '../../formats/ini/sageIniSchema';
import { isFragmentPath, parseSageIni } from '../../formats/ini/sageIniParser';
import type { SageDocument } from '../../formats/ini/sageIniParser';
import { onDidChangeSetting, settings } from '../../platform/settings';

const SCHEMA_PATH = ['assets', 'sageIniSchema.json'];

const PARSE_CACHE_LIMIT = 8;

export class SageIniDocuments implements Disposable {
  private schema?: Promise<SageIniSchema>;
  private parses = new Map<string, { version: number; parsed: SageDocument }>();
  private readonly subscriptions: Disposable[];

  private readonly onDidChangeSchemaEmitter = new EventEmitter<void>();

  public readonly onDidChangeSchema = this.onDidChangeSchemaEmitter.event;

  public constructor(private readonly extensionUri: Uri) {
    this.subscriptions = [
      workspace.onDidCloseTextDocument((document) =>
        this.parses.delete(document.uri.toString()),
      ),
      onDidChangeSetting([settings.iniGame], () => {
        this.schema = undefined;
        this.parses.clear();
        this.onDidChangeSchemaEmitter.fire();
      }),
      this.onDidChangeSchemaEmitter,
    ];
  }

  public dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public getSchema(): Promise<SageIniSchema> {
    this.schema ??= this.loadSchema();

    return this.schema;
  }

  public async parse(document: TextDocument): Promise<SageDocument> {
    const key = document.uri.toString();
    const cached = this.parses.get(key);

    if (cached?.version === document.version) {
      return cached.parsed;
    }

    const parsed = parseSageIni(
      document.getText().split(/\r?\n/),
      await this.getSchema(),
      { isFragment: isFragmentPath(document.uri.path) },
    );

    if (this.parses.size >= PARSE_CACHE_LIMIT) {
      this.parses.delete(this.parses.keys().next().value as string);
    }

    this.parses.set(key, { version: document.version, parsed });

    return parsed;
  }

  private async loadSchema(): Promise<SageIniSchema> {
    const uri = Uri.joinPath(this.extensionUri, ...SCHEMA_PATH);
    const content = await workspace.fs.readFile(uri);

    const game: SageGame = settings.iniGame.get();

    return createSageIniSchema(
      JSON.parse(new TextDecoder().decode(content)),
      game,
    );
  }
}
