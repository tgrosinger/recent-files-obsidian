import { addIcon, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import RecentFilesListView from './view.ts';
import RecentFilesSettingTab from './settings.ts';
import { DEFAULT_DATA, defaultMaxLength, type FilePath, type RecentFilesData } from './data.ts';
import { sweepIcon } from './ui.ts';

export default class RecentFilesPlugin extends Plugin {
  public data: RecentFilesData;
  public view: RecentFilesListView;

  public async onload(): Promise<void> {
    await this.loadData();
    this.initializePlugin();
    this.registerEventHandlers();
    this.addSettingTab(new RecentFilesSettingTab(this.app, this));
  }

  public onunload(): void {
    this.app.workspace.unregisterHoverLinkSource('recent-files');
  }

  private initializePlugin(): void {
    addIcon('sweep', sweepIcon);
    this.registerView('recent-files', (leaf) => (this.view = new RecentFilesListView(leaf, this, this.data)));
    this.addOpenCommand();
    this.registerHoverLinkSource();
  }

  private registerEventHandlers(): void {
    this.registerEvent(this.app.vault.on('rename', this.handleRename));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete));
  }

  private addOpenCommand(): void {
    this.addCommand({
      id: 'recent-files-open',
      name: 'Open',
      callback: async () => {
        let leaf: WorkspaceLeaf | null;
        [leaf] = this.app.workspace.getLeavesOfType('recent-files');
        if (!leaf) {
          leaf = this.app.workspace.getLeftLeaf(false);
          await leaf?.setViewState({ type: 'recent-files' });
        }
        if (!leaf) return;
        await this.app.workspace.revealLeaf(leaf);
      },
    });
  }

  registerHoverLinkSource(): void {
    this.app.workspace.registerHoverLinkSource('recent-files', {
      display: 'Recent Files',
      defaultMod: true,
    });
  }

  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
  }

  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }

  // not used
  public async onExternalSettingsChange(): Promise<void> {
    await this.loadData();
    this.view.redraw();
  }

  public readonly pruneOmittedFiles = async (): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(this.shouldAddFile);
    await this.saveData();
  };

  public readonly pruneLength = async (): Promise<void> => {
    const toRemove = this.data.recentFiles.length - (this.data.maxLength || defaultMaxLength);
    if (toRemove > 0) {
      this.data.recentFiles.splice(this.data.recentFiles.length - toRemove, toRemove);
    }
    await this.saveData();
  };

  public readonly shouldAddFile = (file: FilePath): boolean => {
    const patterns: string[] = this.data.omittedPaths.filter(
      (path) => path.trim().length > 0,
    );

    if (patterns.length > 0) {
      const patternMatches = patterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(file.path);
        } catch (error) {
          console.error(`Recent Files: Invalid regex pattern "${pattern}":`,
            error instanceof Error ? error.message : 'Unknown error');
          return false;
        }
      });
      if (patternMatches) return false;
    }

    const tfile = this.app.vault.getFileByPath(file.path);
    if (tfile) {
        const omittedTags: string[] = this.data.omittedTags.filter(
            (tag) => tag.trim().length > 0,
        );
        if (omittedTags.length > 0) {
            const fileTags: string[] = this.app.metadataCache.getFileCache(tfile)?.frontmatter?.tags || [];
            if (fileTags.some(tag => omittedTags.includes(tag))) {
                return false;
            }
        }
    }
  
    return true;
  }

  // not used
  public onUserEnable(): void {
    this.app.workspace.ensureSideLeaf('recent-files', 'left', { reveal: true });
  }

  private readonly handleRename = async (file: TAbstractFile, oldPath: string): Promise<void> => {
    if (!(file instanceof TFile)) return;
    const entry = this.data.recentFiles.find((recentFile) => recentFile.path === oldPath);
    if (entry) {
      entry.path = file.path;
      entry.basename = file.basename
      this.view.redraw();
      await this.saveData();
    }
  };

  private readonly handleDelete = async (file: TAbstractFile): Promise<void> => {
    if (!(file instanceof TFile)) return;
    const beforeLen = this.data.recentFiles.length;
    this.data.recentFiles = this.data.recentFiles.filter((recentFile) => recentFile.path !== file.path);

    if (beforeLen !== this.data.recentFiles.length) {
      this.view.redraw();
      await this.saveData();
    }
  };
}