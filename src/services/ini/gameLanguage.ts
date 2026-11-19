import { EventEmitter, window } from 'vscode';
import type { Disposable, Memento } from 'vscode';
import type { ArchiveModel } from '../archives/archiveModel';
import {
  AUTO_LANGUAGE,
  chooseLanguage,
  listInstalledLanguages,
} from '../../game/text/gameLanguage';
import { onDidChangeSetting, settings } from '../../platform/settings';
import type { SageIniIndex } from './sageIniIndex';

const REMEMBERED = 'bigfs.language.chosen';

export class GameLanguage implements Disposable {
  private readonly changed = new EventEmitter<string | undefined>();
  private readonly subscription: Disposable;
  private asking?: Promise<string | undefined>;
  private declined?: string;
  private applied?: string;

  public readonly onDidChange = this.changed.event;

  public constructor(
    private readonly archiveModel: ArchiveModel,
    private readonly state: Memento,
    private readonly index: SageIniIndex,
  ) {
    this.subscription = onDidChangeSetting([settings.language], () => {
      void this.ensure();
    });
  }

  public dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }

  public async listInstalled(): Promise<string[]> {
    await this.archiveModel.whenReady();
    return listInstalledLanguages(
      this.archiveModel
        .getArchiveRoots()
        .map((root) => root.archive.archivePath),
    );
  }

  public async ensure(): Promise<string | undefined> {
    const installed = await this.listInstalled();
    const choice = chooseLanguage(
      settings.language.get(),
      installed,
      this.state.get<string>(REMEMBERED),
    );
    let language = choice.language;

    if (choice.ask) {
      this.asking ??= this.askOnce(installed).finally(() => {
        this.asking = undefined;
      });
      language = await this.asking;
    }
    this.apply(language);
    return language;
  }

  public async choose(): Promise<void> {
    const installed = await this.listInstalled();

    if (!installed.length) {
      void window.showInformationMessage(
        'No lang/<Language>.big archive was found, so the game has no text language to choose.',
      );
      return;
    }

    const picked = await this.pick(installed);

    if (picked) {
      await this.remember(picked);
      this.apply(picked);
    }
  }

  private apply(language: string | undefined): void {
    if (language === this.applied) {
      return;
    }
    this.applied = language;
    this.index.setLanguage(language);
    this.changed.fire(language);
  }

  private async remember(language: string): Promise<void> {
    await this.state.update(REMEMBERED, language);

    if (settings.language.get() !== AUTO_LANGUAGE) {
      await settings.language.update(language);
    }
  }

  private pick(installed: readonly string[]): Thenable<string | undefined> {
    const current = this.state.get<string>(REMEMBERED);

    return window
      .showQuickPick(
        installed.map((language) => ({
          label: language,
          description: language === current ? 'current' : undefined,
        })),
        {
          title: 'bigFS: Choose Game Language',
          placeHolder: 'Game text language',
        },
      )
      .then((item) => item?.label);
  }

  private async askOnce(installed: string[]): Promise<string> {
    if (this.declined && installed.includes(this.declined)) {
      return this.declined;
    }

    const picked = await this.pick(installed);

    if (picked) {
      await this.remember(picked);
      return picked;
    }
    this.declined = installed.includes('english') ? 'english' : installed[0];
    return this.declined;
  }
}
