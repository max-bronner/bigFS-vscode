import { FileType, ProgressLocation, Uri, window, workspace } from "vscode";
import type { Disposable, LogOutputChannel, TextDocument } from "vscode";
import type { ArchiveModel } from "../archives/archiveModel";
import type { VirtualNode } from "../archives/virtualNode";
import { getFileNodes } from "../archives/virtualNode";
import { getNodeUri } from "../archives/nodeAddress";
import type { SageIniSchema } from "../../formats/ini/sageIniSchema";
import { languageOfArchive } from "../../game/text/gameLanguage";
import {
  FILE_USES,
  collectEntries,
  reachedThroughMacros,
} from "../../formats/ini/sageIniEntries";
import type { EntryBodyToken } from "../../formats/ini/sageIniEntries";
import { canonicalNamespace } from "../../formats/ini/sageReferenceFields";
import { SAGE_INI_LANGUAGE } from "../../constants";
import { findString, parseStringTable } from "../../formats/str/sageStringTable";
import type { SageString } from "../../formats/str/sageStringTable";
import { decodeIniText } from "../../core/windows1252";

export interface SageDefinition {
  uri: Uri;
  line: number;
  endLine: number;
  keyword: string;
  start: number;
  end: number;
  name: string;
}

export interface SageMacro {
  name: string;
  value: string;
  start: number;
  end: number;
  uri: Uri;
  line: number;
}

export interface SageStringPlace extends SageString {
  uri: Uri;
  language?: string;
}

const isMapStringTable = (uri: Uri): boolean =>
  uri.path.toLowerCase().endsWith("/map.str");

export interface SageReference {
  uri: Uri;
  line: number;
  start: number;
  end: number;
  field: string;
}

export { FILE_USES };

interface SageBodyToken extends EntryBodyToken {
  uri: Uri;
}

const OPEN_DOCUMENT_DELAY_MS = 300;

const ENTRY_PATTERN = /\.(ini|inc|bhav|str)$/i;

const LOOSE_PATTERN = "**/*.{ini,inc,bhav,str,INI,INC,BHAV,STR}";

const isSageEntry = (node: VirtualNode): boolean =>
  node.type === FileType.File && ENTRY_PATTERN.test(node.entryPath);

const record = <T>(
  table: Map<string, Map<string, T[]>>,
  namespace: string,
  name: string,
  value: T,
): void => {
  const byName = table.get(namespace.toLowerCase()) ?? new Map<string, T[]>();
  const key = name.toLowerCase();

  byName.set(key, [...(byName.get(key) ?? []), value]);
  table.set(namespace.toLowerCase(), byName);
};

const isUnderRoot = ({ uri }: { uri: Uri }, rootKey: string): boolean => {
  const path = uri.path.toLowerCase();

  return path === rootKey || path.startsWith(`${rootKey}/`);
};

const purgeList = <T extends { uri: Uri }>(
  table: Map<string, T[]>,
  rootKey: string,
): void => {
  for (const [key, places] of table) {
    const kept = places.filter((place) => !isUnderRoot(place, rootKey));

    if (kept.length) {
      table.set(key, kept);
    } else {
      table.delete(key);
    }
  }
};

const purgeOne = <T extends { uri: Uri }>(
  table: Map<string, T>,
  rootKey: string,
): void => {
  for (const [key, value] of table) {
    if (isUnderRoot(value, rootKey)) {
      table.delete(key);
    }
  }
};

const purgeNamespaced = <T extends { uri: Uri }>(
  table: Map<string, Map<string, T[]>>,
  rootKey: string,
): void => {
  for (const byName of table.values()) {
    purgeList(byName, rootKey);
  }
};

export class SageIniIndex implements Disposable {
  private definitions = new Map<string, Map<string, SageDefinition[]>>();
  private references = new Map<string, Map<string, SageReference[]>>();

  private macros = new Map<string, SageMacro>();

  private constantUses = new Map<string, SageReference[]>();

  private bodyTokens = new Map<string, SageBodyToken[]>();

  private indexedFiles = new Set<string>();

  private openVersions = new Map<string, number>();

  private readonly pendingOpen = new Map<string, NodeJS.Timeout>();

  private strings = new Map<string, SageStringPlace[]>();

  private activeStrings?: Map<string, SageStringPlace>;
  private language?: string;

  private indexed = new Set<string>();

  private building?: Promise<void>;
  private readonly subscriptions: Disposable[];

  public constructor(
    private readonly archiveModel: ArchiveModel,
    private readonly getSchema: () => Promise<SageIniSchema>,
    private readonly log: LogOutputChannel,
  ) {
    const watcher = workspace.createFileSystemWatcher(LOOSE_PATTERN);
    const reindexLooseFile = (uri: Uri) => {
      this.forget(uri.path.toLowerCase());

      if (this.indexed.size) {
        void this.indexLooseFile(uri).catch((error: unknown) =>
          this.log.error(`Failed to index ${uri.fsPath}`, error),
        );
      }
    };

    this.subscriptions = [
      archiveModel.onDidChangeArchive(({ rootPath }) => {
        this.forget(rootPath.toLowerCase());
      }),
      watcher,
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
    this.definitions.clear();
    this.references.clear();
    this.macros.clear();
    this.constantUses.clear();
    this.bodyTokens.clear();
    this.indexedFiles.clear();
    this.openVersions.clear();
    this.strings.clear();
    this.activeStrings = undefined;
    this.indexed.clear();
  }

  public findMacro(name: string): SageMacro | undefined {
    return this.macros.get(name.toLowerCase());
  }

  public findString(value: string): SageStringPlace | undefined {
    return findString(this.activeTable(), value) as SageStringPlace | undefined;
  }

  public get stringCount(): number {
    return this.activeTable().size;
  }

  public setLanguage(language: string | undefined): void {
    if (language !== this.language) {
      this.language = language;
      this.activeStrings = undefined;
    }
  }

  private activeTable(): Map<string, SageStringPlace> {
    if (!this.activeStrings) {
      const table = new Map<string, SageStringPlace>();

      for (const [key, places] of this.strings) {
        const usable = places.filter(
          (place) => !place.language || place.language === this.language,
        );
        const chosen =
          usable.find((place) => !isMapStringTable(place.uri)) ?? usable[0];

        if (chosen) {
          table.set(key, chosen);
        }
      }
      this.activeStrings = table;
    }
    return this.activeStrings;
  }

  public findMacroUses(name: string): readonly SageReference[] {
    return this.constantUses.get(name.toLowerCase()) ?? [];
  }

  public getMacroNames(): SageMacro[] {
    return [...this.macros.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  public findDefinitions(
    namespace: string,
    name: string,
  ): readonly SageDefinition[] {
    return (
      this.definitions
        .get(canonicalNamespace(namespace).toLowerCase())
        ?.get(name.toLowerCase()) ?? []
    );
  }

  public countDefinitions(namespace: string): number {
    return (
      this.definitions.get(canonicalNamespace(namespace).toLowerCase())?.size ??
      0
    );
  }

  public getNames(namespace: string): string[] {
    const byName = this.definitions.get(
      canonicalNamespace(namespace).toLowerCase(),
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

    for (const [namespace, byName] of this.definitions) {
      if (skip.has(namespace) || !this.references.has(namespace)) {
        continue;
      }

      const named = this.references.get(namespace)!;

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
    const key = canonicalNamespace(namespace).toLowerCase();
    const folded = name.toLowerCase();
    const written = this.references.get(key);
    const direct = written?.get(folded) ?? [];
    const holders = this.bodyTokens.get(folded);

    if (!holders?.length || !written) {
      return direct;
    }

    const viaMacros = reachedThroughMacros(
      holders,
      this.bodyTokens,
      (macro) => (written.get(macro)?.length ?? 0) > 0,
    ).map(
      (holder): SageReference => ({
        uri: holder.uri,
        line: holder.line,
        start: holder.start,
        end: holder.end,
        field: `#define ${this.macros.get(holder.macro)?.name ?? holder.macro}`,
      }),
    );

    return [...direct, ...viaMacros];
  }

  public whenReady(): Promise<void> {
    this.building ??= this.buildWithProgress();

    return this.building;
  }

  private async buildWithProgress(): Promise<void> {
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
    } finally {
      this.building = undefined;
    }
  }

  private forget(rootKey: string): void {
    if (this.indexed.delete(rootKey)) {
      this.purge(rootKey);
    }
  }

  private purge(rootKey: string): void {
    for (const file of this.indexedFiles) {
      if (file === rootKey || file.startsWith(`${rootKey}/`)) {
        this.indexedFiles.delete(file);
      }
    }

    purgeNamespaced(this.definitions, rootKey);
    purgeNamespaced(this.references, rootKey);
    purgeOne(this.macros, rootKey);
    purgeList(this.constantUses, rootKey);
    purgeList(this.bodyTokens, rootKey);
    purgeList(this.strings, rootKey);
    this.activeStrings = undefined;
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
          languageOfArchive(root.archive.archivePath),
        );
      },
    );
  }

  private indexStrings(uri: Uri, text: string, language?: string): void {
    for (const [key, record] of parseStringTable(text)) {
      this.strings.set(key, [
        ...(this.strings.get(key) ?? []),
        { ...record, uri, language },
      ]);
    }
    this.activeStrings = undefined;
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

    const fileKey = uri.path.toLowerCase();

    if (this.indexedFiles.has(fileKey)) {
      this.purge(fileKey);
    }

    this.indexedFiles.add(fileKey);

    const entries = collectEntries(text, entryPath, schema);

    entries.macros.forEach((macro) => {
      this.macros.set(macro.name.toLowerCase(), { ...macro, uri });
    });

    entries.bodyTokens.forEach((token) => {
      const list = this.bodyTokens.get(token.text) ?? [];

      list.push({ ...token, uri });
      this.bodyTokens.set(token.text, list);
    });

    entries.definitions.forEach(({ namespace, ...definition }) =>
      record(this.definitions, namespace, definition.name, {
        uri,
        ...definition,
      }),
    );

    entries.constantUses.forEach(({ key, ...use }) =>
      this.constantUses.set(key, [
        ...(this.constantUses.get(key) ?? []),
        { uri, ...use },
      ]),
    );

    entries.references.forEach(({ namespace, name, ...place }) =>
      record(this.references, namespace, name, { uri, ...place }),
    );
  }
}
