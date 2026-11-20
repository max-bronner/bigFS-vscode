import { FileType, ProgressLocation, Uri, window, workspace } from "vscode";
import type { LoadOrder } from "../archives/loadOrder";
import type { Disposable, LogOutputChannel, TextDocument } from "vscode";
import type { ArchiveModel } from "../archives/archiveModel";
import type { VirtualNode } from "../archives/virtualNode";
import { findChild, getFileNodes } from "../archives/virtualTree";
import { getNodeUri } from "../archives/nodeAddress";
import type { SageIniSchema } from "../../formats/ini/sageIniSchema";
import { getArchiveLanguage } from "../../game/text/gameLanguage";
import {
  collectEntries,
  reachedThroughMacros,
} from "../../formats/ini/sageIniEntries";
import { toCanonicalNamespace } from "../../formats/ini/sageReferenceFields";
import { SAGE_INI_LANGUAGE } from "../../constants";
import { findString, parseStringTable } from "../../formats/str/sageStringTable";
import { createSageIniTables } from "./sageIniTables";
import type {
  SageDefinition,
  SageMacro,
  SageReference,
  SageStringPlace,
} from "./sageIniTables";
import { decodeIniText } from "../../core/windows1252";

const isMapStringTable = (uri: Uri): boolean =>
  uri.path.toLowerCase().endsWith("/map.str");

const OPEN_DOCUMENT_DELAY_MS = 300;

const ENTRY_PATTERN = /\.(ini|inc|bhav|str)$/i;

const LOOSE_PATTERN = "**/*.{ini,inc,bhav,str,INI,INC,BHAV,STR}";

const isSageEntry = (node: VirtualNode): boolean =>
  node.type === FileType.File && ENTRY_PATTERN.test(node.entryPath);

export class SageIniIndex implements Disposable {
  private readonly tables = createSageIniTables();

  private openVersions = new Map<string, number>();

  private readonly pendingOpen = new Map<string, NodeJS.Timeout>();

  private readonly activeStrings = new Map<string, Map<string, SageStringPlace>>();
  private language?: string;

  private indexed = new Set<string>();

  private building?: Promise<void>;

  private refreshing: Promise<void> = Promise.resolve();

  private needsBuild = true;
  private readonly subscriptions: Disposable[];

  public constructor(
    private readonly archiveModel: ArchiveModel,
    private readonly getSchema: () => Promise<SageIniSchema>,
    private readonly log: LogOutputChannel,
  ) {
    const watcher = workspace.createFileSystemWatcher(LOOSE_PATTERN);
    const folders = workspace.createFileSystemWatcher("**/*", false, true, false);
    const reindexLooseFile = (uri: Uri) => {
      this.forget(uri.path.toLowerCase());

      if (this.indexed.size) {
        void this.indexLooseFile(uri).catch((error: unknown) =>
          this.log.error(`Failed to index ${uri.fsPath}`, error),
        );
      } else {
        this.needsBuild = true;
      }
    };

    this.subscriptions = [
      archiveModel.onDidChangeArchive(
        ({ rootPath, archivePath, loaded, entries }) => {
          const rootKey = rootPath.toLowerCase();

          if (entries && !this.building && this.indexed.has(rootKey)) {
            this.refreshEntries(archivePath, rootKey, entries);
            return;
          }

          this.forget(rootKey);
          this.needsBuild ||= !loaded;
        },
      ),
      archiveModel.onDidScan(() => {
        this.needsBuild = true;
        this.activeStrings.clear();
      }),
      watcher,
      folders,
      folders.onDidCreate(() => {
        this.needsBuild = true;
      }),
      folders.onDidDelete((uri) => {
        const removed = uri.path.toLowerCase();

        for (const key of [...this.indexed]) {
          if (key === removed || key.startsWith(`${removed}/`)) {
            this.forget(key);
          }
        }
      }),
      watcher.onDidChange(reindexLooseFile),
      watcher.onDidCreate(reindexLooseFile),
      watcher.onDidDelete((uri) => this.forget(uri.path.toLowerCase())),
      workspace.onDidChangeTextDocument(({ document }) =>
        this.readSoon(document),
      ),
      workspace.onDidCloseTextDocument((document) =>
        this.restoreFromDisk(document),
      ),
    ];
  }

  public dispose(): void {
    this.pendingOpen.forEach((timeout) => clearTimeout(timeout));
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public reset(): void {
    this.tables.clear();
    this.openVersions.clear();
    this.activeStrings.clear();
    this.indexed.clear();
    this.needsBuild = true;
  }

  private get loadOrder(): LoadOrder | undefined {
    return (this.archiveModel as Partial<ArchiveModel> | undefined)?.loadOrder;
  }

  private order<T extends { uri: Uri }>(places: readonly T[], from?: Uri): readonly T[] {
    return this.loadOrder?.orderPlaces(places, from) ?? places;
  }

  public findMacro(name: string, from?: Uri): SageMacro | undefined {
    const key = name.toLowerCase();

    if (!this.loadOrder) {
      return this.tables.macros.get(key);
    }
    return this.order(this.tables.macroDefinitions.get(key) ?? [], from)[0];
  }

  public findString(value: string, from?: Uri): SageStringPlace | undefined {
    return findString(this.getActiveStringTable(from), value) as SageStringPlace | undefined;
  }

  public get stringCount(): number {
    return this.getActiveStringTable().size;
  }

  public setLanguage(language: string | undefined): void {
    if (language !== this.language) {
      this.language = language;
      this.activeStrings.clear();
    }
  }

  private getActiveStringTable(from?: Uri): Map<string, SageStringPlace> {
    const key = from ? `/${this.loadOrder?.getStackKey(from) ?? ""}` : "";
    let table = this.activeStrings.get(key);

    if (!table) {
      table = new Map<string, SageStringPlace>();

      for (const [label, places] of this.tables.strings) {
        const usable = this.order(places, from).filter(
          (place) => !place.language || place.language === this.language,
        );
        const chosen =
          usable.find((place) => !isMapStringTable(place.uri)) ?? usable[0];

        if (chosen) {
          table.set(label, chosen);
        }
      }
      this.activeStrings.set(key, table);
    }
    return table;
  }

  public findMacroUses(name: string): readonly SageReference[] {
    return this.tables.constantUses.get(name.toLowerCase()) ?? [];
  }

  public getMacros(from?: Uri): SageMacro[] {
    const macros = this.loadOrder
      ? [...this.tables.macros.keys()].flatMap((key) => {
          const found = this.findMacro(key, from);

          return found ? [found] : [];
        })
      : [...this.tables.macros.values()];

    return macros.sort((a, b) => a.name.localeCompare(b.name));
  }

  public findDefinitions(
    namespace: string,
    name: string,
    from?: Uri,
  ): readonly SageDefinition[] {
    return this.order(
      this.tables.definitions
        .get(toCanonicalNamespace(namespace).toLowerCase())
        ?.get(name.toLowerCase()) ?? [],
      from,
    );
  }

  public countDefinitions(namespace: string): number {
    return (
      this.tables.definitions.get(toCanonicalNamespace(namespace).toLowerCase())?.size ??
      0
    );
  }

  public getNames(namespace: string): string[] {
    const byName = this.tables.definitions.get(
      toCanonicalNamespace(namespace).toLowerCase(),
    );

    if (!byName) {
      return [];
    }

    const names = new Set<string>();

    for (const definitions of byName.values()) {
      definitions.forEach((definition) => names.add(definition.name));
    }

    return [...names].sort();
  }

  public findUnreferenced(
    include: (definition: SageDefinition) => boolean,
    skip: ReadonlySet<string>,
  ): SageDefinition[] {
    const unused: SageDefinition[] = [];

    for (const [namespace, byName] of this.tables.definitions) {
      if (skip.has(namespace) || !this.tables.references.has(namespace)) {
        continue;
      }

      const named = this.tables.references.get(namespace)!;

      for (const [name, definitions] of byName) {
        if (!named.get(name)?.length) {
          unused.push(...definitions.filter(include));
        }
      }
    }
    return unused;
  }

  public findReferences(
    namespace: string,
    name: string,
  ): readonly SageReference[] {
    const key = toCanonicalNamespace(namespace).toLowerCase();
    const folded = name.toLowerCase();
    const written = this.tables.references.get(key);
    const direct = written?.get(folded) ?? [];
    const holders = this.tables.bodyTokens.get(folded);

    if (!holders?.length || !written) {
      return direct;
    }

    const viaMacros = reachedThroughMacros(
      holders,
      this.tables.bodyTokens,
      (macro) => (written.get(macro)?.length ?? 0) > 0,
    ).map(
      (holder): SageReference => ({
        uri: holder.uri,
        line: holder.line,
        start: holder.start,
        end: holder.end,
        field: `#define ${this.tables.macros.get(holder.macro)?.name ?? holder.macro}`,
      }),
    );

    return [...direct, ...viaMacros];
  }

  public whenReady(): Promise<void> {
    if (!this.building && this.needsBuild) {
      this.building = this.buildWithProgress();
    }

    return (this.building ?? Promise.resolve()).then(() => this.refreshing);
  }

  private async buildWithProgress(): Promise<void> {
    this.needsBuild = false;

    try {
      await window.withProgress(
        {
          location: ProgressLocation.Window,
          title: "bigFS: indexing INI definitions",
        },
        () => this.build(),
      );
    } catch (error) {
      this.log.error("Failed to index INI definitions", error);
      this.needsBuild = true;
    } finally {
      this.building = undefined;
    }
  }

  private refreshEntries(
    archivePath: string,
    rootKey: string,
    entries: readonly string[],
  ): void {
    entries.forEach((entry) =>
      this.purge(`${rootKey}/${entry.toLowerCase()}`),
    );
    this.openVersions.clear();
    this.refreshing = this.refreshing
      .then(() => this.readEntries(archivePath, entries))
      .catch((error: unknown) =>
        this.log.error(`Failed to index ${archivePath}`, error),
      );
  }

  private async readEntries(
    archivePath: string,
    entries: readonly string[],
  ): Promise<void> {
    const archive = this.archiveModel.getArchiveByPath(archivePath);

    if (archive) {
      const schema = await this.getSchema();
      const nodes = new Set(
        entries.flatMap((entry) => {
          const found = findChild(archive.root, entry);

          return found ? getFileNodes(found).filter(isSageEntry) : [];
        }),
      );

      await this.archiveModel.readFiles(
        [...nodes].map((node) => ({ node })),
        async ({ node }, content) => {
          this.indexContent(
            getNodeUri(node),
            node.entryPath,
            content,
            schema,
            getArchiveLanguage(archive.archivePath),
          );
        },
      );
    }

    await this.syncOpenDocuments();
  }

  private forget(rootKey: string): void {
    if (this.indexed.delete(rootKey)) {
      this.purge(rootKey);
    }
  }

  private purge(rootKey: string): void {
    this.tables.purge(rootKey);
    this.activeStrings.clear();
  }

  private isOpenIni(document: TextDocument): boolean {
    return (
      document.languageId === SAGE_INI_LANGUAGE &&
      /\.(ini|inc|bhav)$/i.test(document.uri.path)
    );
  }

  private readSoon(document: TextDocument): void {
    if (!this.indexed.size || !this.isOpenIni(document)) {
      return;
    }

    const key = document.uri.toString();

    clearTimeout(this.pendingOpen.get(key));
    this.pendingOpen.set(
      key,
      setTimeout(() => {
        this.pendingOpen.delete(key);
        void this.readOpenDocument(document);
      }, OPEN_DOCUMENT_DELAY_MS),
    );
  }

  private async readOpenDocument(document: TextDocument): Promise<void> {
    const schema = await this.getSchema();

    if (
      document.isClosed ||
      this.openVersions.get(document.uri.toString()) === document.version
    ) {
      return;
    }

    this.openVersions.set(document.uri.toString(), document.version);
    this.purge(document.uri.path.toLowerCase());
    this.indexText(document.uri, document.uri.path, document.getText(), schema);
  }

  public async syncOpenDocuments(): Promise<void> {
    for (const document of workspace.textDocuments) {
      if (this.isOpenIni(document)) {
        clearTimeout(this.pendingOpen.get(document.uri.toString()));
        this.pendingOpen.delete(document.uri.toString());
        await this.readOpenDocument(document);
      }
    }
  }

  private restoreFromDisk(document: TextDocument): void {
    const key = document.uri.toString();

    clearTimeout(this.pendingOpen.get(key));
    this.pendingOpen.delete(key);

    if (this.openVersions.delete(key)) {
      void this.indexLooseFile(document.uri, undefined, true).catch(
        (error: unknown) =>
          this.log.error(`Failed to index ${document.uri.fsPath}`, error),
      );
    }
  }

  private async build(): Promise<void> {
    const schema = await this.getSchema();

    for (const root of this.archiveModel.getArchiveRoots()) {
      const rootKey = root.archive.rootKey;

      if (this.indexed.has(rootKey)) {
        continue;
      }

      try {
        await this.indexArchive(root, schema);
        this.indexed.add(rootKey);
      } catch (error) {
        this.log.error(`Failed to index ${root.archive.archivePath}`, error);
      }
    }

    for (const uri of await workspace.findFiles(
      LOOSE_PATTERN,
      "**/node_modules/**",
    )) {
      if (this.indexed.has(uri.path.toLowerCase())) {
        continue;
      }

      try {
        await this.indexLooseFile(uri, schema);
      } catch (error) {
        this.log.error(`Failed to index ${uri.fsPath}`, error);
      }
    }

    await this.syncOpenDocuments();
  }

  private async indexLooseFile(
    uri: Uri,
    schema?: SageIniSchema,
    replace = false,
  ): Promise<void> {
    const content = await workspace.fs.readFile(uri);

    if (replace) {
      this.purge(uri.path.toLowerCase());
    }

    this.indexContent(
      uri,
      uri.path,
      content,
      schema ?? (await this.getSchema()),
    );
    this.indexed.add(uri.path.toLowerCase());
  }

  private async indexArchive(
    root: VirtualNode,
    schema: SageIniSchema,
  ): Promise<void> {
    await this.archiveModel.loadArchiveOf(root);

    const entries = getFileNodes(root).filter(isSageEntry);

    if (!entries.length) {
      return;
    }

    await this.archiveModel.readFiles(
      entries.map((node) => ({ node })),
      async ({ node }, content) => {
        this.indexContent(
          getNodeUri(node),
          node.entryPath,
          content,
          schema,
          getArchiveLanguage(root.archive.archivePath),
        );
      },
    );
  }

  private indexStrings(uri: Uri, text: string, language?: string): void {
    this.tables.replaceStrings(uri, parseStringTable(text), language);
    this.activeStrings.clear();
  }

  private indexContent(
    uri: Uri,
    entryPath: string,
    content: Uint8Array,
    schema: SageIniSchema,
    language?: string,
  ): void {
    this.indexText(uri, entryPath, decodeIniText(content), schema, language);
  }

  private indexText(
    uri: Uri,
    entryPath: string,
    text: string,
    schema: SageIniSchema,
    language?: string,
  ): void {
    if (entryPath.toLowerCase().endsWith(".str")) {
      this.indexStrings(uri, text, language);
      return;
    }

    this.tables.replaceFile(uri, collectEntries(text, entryPath, schema));
  }
}
