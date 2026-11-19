import * as vscode from 'vscode';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { SCHEME } from '../../constants';
import type { VirtualNode } from '../../services/archives/virtualNode';

export class BigFileSystemProvider implements vscode.FileSystemProvider, vscode.Disposable {
  private onDidChangeFileEmitter = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

  private bufferedEvents: vscode.FileChangeEvent[] = [];
  private fireSoonHandle?: NodeJS.Timeout;
  private readonly archiveSubscription: vscode.Disposable;

  constructor(private archiveModel: ArchiveModel) {
    this.archiveSubscription = archiveModel.onDidChangeArchive(({ rootPath }) => {
      this.fireChangedDocuments(rootPath);
    });
  }

  dispose(): void {
    this.archiveSubscription.dispose();
    clearTimeout(this.fireSoonHandle);
    this.bufferedEvents = [];
    this.onDidChangeFileEmitter.dispose();
  }

  private fireChangedDocuments(rootPath: string): void {
    const archivePrefix = `${rootPath.toLowerCase()}/`;

    const changes = vscode.workspace.textDocuments
      .filter(
        (document) =>
          document.uri.scheme === SCHEME &&
          !document.isDirty &&
          document.uri.path.toLowerCase().startsWith(archivePrefix),
      )
      .map((document) => ({
        type: vscode.FileChangeType.Changed,
        uri: document.uri,
      }));

    if (changes.length) {
      this.fireSoon(...changes);
    }
  }

  private fireSoon(...events: vscode.FileChangeEvent[]): void {
    this.bufferedEvents.push(...events);

    if (this.fireSoonHandle) {
      clearTimeout(this.fireSoonHandle);
    }

    this.fireSoonHandle = setTimeout(() => {
      this.onDidChangeFileEmitter.fire(this.bufferedEvents);
      this.bufferedEvents = [];
    }, 5);
  }

  watch(_uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  private resolveNode(uri: vscode.Uri): Promise<VirtualNode | undefined> {
    return this.archiveModel.resolveNode(uri);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const node = await this.resolveNode(uri);
    if (!node) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const size =
      node.type === vscode.FileType.File
        ? this.archiveModel.getFileSize(node)
        : 0;

    const mtime = node.archive?.getModifiedAt(node.entryPath) ?? 0;

    return {
      type: node.type,
      ctime: mtime,
      mtime,
      size,
      permissions: this.archiveModel.isReadOnly(node.archive)
        ? vscode.FilePermission.Readonly
        : undefined,
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const node = await this.resolveNode(uri);
    if (!node || node.type !== vscode.FileType.Directory) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const result: [string, vscode.FileType][] = [];
    if (node.children) {
      for (const childNode of node.children.values()) {
        result.push([childNode.name, childNode.type]);
      }
    }

    return result;
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const node = await this.resolveNode(uri);
    if (!node) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const content = await this.archiveModel.getFileContent(node);
    if (!content) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return content;
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    this.archiveModel.ensureWritable(uri);

    if (await this.resolveNode(uri)) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    await this.archiveModel.createDirectory(uri);

    this.fireSoon({ type: vscode.FileChangeType.Created, uri });
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    this.archiveModel.ensureWritable(uri);

    const existingNode = await this.resolveNode(uri);

    if (!existingNode && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (existingNode && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    await this.archiveModel.writeFile(uri, content);

    this.fireSoon({
      type: existingNode
        ? vscode.FileChangeType.Changed
        : vscode.FileChangeType.Created,
      uri,
    });
  }

  async delete(uri: vscode.Uri): Promise<void> {
    this.archiveModel.ensureWritable(uri);

    await this.resolveNode(uri);
    await this.archiveModel.delete(uri);

    this.fireSoon({ type: vscode.FileChangeType.Deleted, uri });
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    this.archiveModel.ensureWritable(oldUri);
    this.archiveModel.ensureWritable(newUri);

    const sourceNode = await this.resolveNode(oldUri);

    if (!sourceNode) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }

    const targetNode = await this.resolveNode(newUri);

    if (targetNode && targetNode !== sourceNode && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    await this.archiveModel.rename(oldUri, newUri);

    this.fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    );
  }
}
