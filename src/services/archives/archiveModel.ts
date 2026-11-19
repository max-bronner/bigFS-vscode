import type { Event, LogOutputChannel, Uri } from 'vscode';
import type { ConflictChoice } from '../../core/transferPlan';
import type { Archive } from './archive';
import { createArchiveOperations } from './archiveOperations';
import type {
  ArchiveOperations,
  ImportedFile,
  TransferResult,
} from './archiveOperations';
import { createArchivePolicy } from './archivePolicy';
import type { ArchivePolicy } from './archivePolicy';
import { createArchiveRegistry } from './archiveRegistry';
import type { ArchiveChange, ArchiveRegistry } from './archiveRegistry';
import { createArchiveScanner } from './archiveScanner';
import type { ArchiveScanner } from './archiveScanner';
import type { ArchiveSource } from './archiveSource';
import { isInReadOnlySource } from './sourceAccess';
import type { VirtualNode } from './virtualNode';

export interface ArchiveModelOptions {
  readAhead?: boolean;
}

export class ArchiveModel {
  private readonly registry: ArchiveRegistry;
  private readonly scanner: ArchiveScanner;
  private readonly policy: ArchivePolicy;
  private readonly operations: ArchiveOperations;

  public readonly onDidChangeArchive: Event<ArchiveChange>;

  public readonly onDidScan: Event<void>;

  constructor(log: LogOutputChannel, options: ArchiveModelOptions = {}) {
    this.registry = createArchiveRegistry(log, {
      whenReady: () => this.scanner.whenReady(),
      discover: (uri) => this.scanner.discover(uri),
      retryLater: (archivePath) => this.scanner.retryLater(archivePath),
    });
    this.policy = createArchivePolicy(() => this.registry.sources);
    this.operations = createArchiveOperations(this.registry, this.policy, log);
    this.scanner = createArchiveScanner(
      this.registry,
      log,
      options.readAhead !== false,
    );
    this.onDidChangeArchive = this.registry.onDidChangeArchive;
    this.onDidScan = this.scanner.onDidScan;
  }

  public dispose(): void {
    this.registry.dispose();
    this.scanner.dispose();
  }

  public whenReady(): Promise<void> {
    return this.scanner.whenReady();
  }

  public scanWorkspace(): Promise<void> {
    return this.scanner.scanWorkspace();
  }

  public getArchiveRoots(): VirtualNode[] {
    return this.registry.getArchiveRoots();
  }

  public getSources(): readonly ArchiveSource[] {
    return this.registry.sources;
  }

  public getArchivesOf(sourceId: string): readonly Archive[] {
    return this.registry.getArchivesOf(sourceId);
  }

  public isReadOnly(archive: Archive): boolean {
    return this.policy.isReadOnly(archive.sourceId);
  }

  public isSourceReadOnly(sourceId: string): boolean {
    return this.policy.isReadOnly(sourceId);
  }

  public ensureWritable(uri: Uri): void {
    const [sourceId = ''] = uri.path.split('/').filter(Boolean);

    this.policy.ensureWritable(sourceId);
  }

  public isReadOnlyUri(uri: Uri): boolean {
    if (uri.scheme === 'file') {
      return isInReadOnlySource(this.registry.sources, uri.fsPath);
    }

    const resolved = this.registry.resolveUri(uri);

    return resolved ? this.isReadOnly(resolved.archive) : false;
  }

  public isLoaded(node: VirtualNode): boolean {
    return node.archive.isLoaded;
  }

  public getArchiveByPath(archivePath: string): Archive | undefined {
    return this.registry.getArchiveByPath(archivePath);
  }

  public getNode(uri: Uri): VirtualNode | undefined {
    return this.registry.getNode(uri);
  }

  public resolveNode(uri: Uri): Promise<VirtualNode | undefined> {
    return this.registry.resolveNode(uri);
  }

  public loadArchiveOf(node: VirtualNode): Promise<void> {
    return this.registry.loadArchiveOf(node);
  }

  public getFileContent(node: VirtualNode): Promise<Uint8Array | undefined> {
    return this.registry.getFileContent(node);
  }

  public getFileSize(node: VirtualNode): number {
    return this.registry.getFileSize(node);
  }

  public getDirectoryContent(directory: VirtualNode): {
    files: string[];
    directories: string[];
  } {
    return this.registry.getDirectoryContent(directory);
  }

  public readFiles<T extends { node: VirtualNode }>(
    items: readonly T[],
    onFile: (item: T, content: Uint8Array) => Promise<void>,
  ): Promise<void> {
    return this.registry.readFiles(items, onFile);
  }

  public writeFile(uri: Uri, content: Uint8Array): Promise<void> {
    return this.operations.writeFile(uri, content);
  }

  public writeFiles(
    files: readonly { uri: Uri; content: Uint8Array }[],
  ): Promise<void> {
    return this.operations.writeFiles(files);
  }

  public createDirectory(uri: Uri): Promise<void> {
    return this.operations.createDirectory(uri);
  }

  public delete(uri: Uri): Promise<void> {
    return this.operations.delete(uri);
  }

  public deleteNodes(nodes: readonly VirtualNode[]): Promise<void> {
    return this.operations.deleteNodes(nodes);
  }

  public rename(oldUri: Uri, newUri: Uri): Promise<void> {
    return this.operations.rename(oldUri, newUri);
  }

  public moveNodes(
    sources: readonly VirtualNode[],
    targetDirectory: VirtualNode,
  ): Promise<void> {
    return this.operations.moveNodes(sources, targetDirectory);
  }

  public copyNodes(
    copies: readonly { source: VirtualNode; targetName: string }[],
    targetDirectory: VirtualNode,
  ): Promise<void> {
    return this.operations.copyNodes(copies, targetDirectory);
  }

  public addFiles(
    targetDirectory: VirtualNode,
    files: readonly ImportedFile[],
  ): Promise<void> {
    return this.operations.addFiles(targetDirectory, files);
  }

  public transferNodes(
    sources: readonly VirtualNode[],
    targetDirectory: VirtualNode,
    move: boolean,
    choose: (names: string[]) => Promise<ConflictChoice | undefined>,
  ): Promise<TransferResult> {
    return this.operations.transferNodes(
      sources,
      targetDirectory,
      move,
      choose,
    );
  }
}
