import {
  ItemView,
  Menu,
  Notice,
  setIcon,
  TFile,
  WorkspaceLeaf,
  type PaneType,
  Keymap
} from 'obsidian';
import { getApiSafe } from 'front-matter-plugin-api-provider';
import type RecentFilesPlugin from './main.ts';
import type { FilePath, RecentFilesData } from './data.ts';

const RecentFilesListViewType = 'recent-files';

export default class RecentFilesListView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RecentFilesPlugin,
    private readonly data: RecentFilesData
  ) {
    super(leaf);
  }

  public async onOpen(): Promise<void> {
    this.redraw();
  }

  public getViewType(): string {
    return RecentFilesListViewType;
  }

  public getDisplayText(): string {
    return 'Recent Files';
  }

  public getIcon(): string {
    return 'clock';
  }

  // not used
  public onPaneMenu(menu: Menu): void {
    menu
      .addItem((item) => {
        item
          .setTitle('Clear list')
          .setIcon('sweep')
          .onClick(async () => {
            this.data.recentFiles = [];
            await this.plugin.saveData();
            this.redraw();
          });
      })
      .addItem((item) => {
        item
          .setTitle('Close')
          .setIcon('cross')
          .onClick(() => {
            this.app.workspace.detachLeavesOfType(RecentFilesListViewType);
          });
      });
  }

  public load(): void {
    super.load();
    this.registerEvent(this.app.workspace.on('file-open', this.update));
  }

  public readonly redraw = (): void => {
    const openFile = this.app.workspace.getActiveFile();

    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const childrenEl = rootEl.createDiv({ cls: 'nav-folder-children' });

    // Add support for the Front Matter Title plugin (https://github.com/snezhig/obsidian-front-matter-title)
    // Get the plugin's safe API and check if the plugin is enabled.
    // If the plugin is not installed, this will not create an error.
    const frontMatterApi = getApiSafe(this.app);
    // We query the "explorer" feature because it is the closest in form to this plugin's features.
    const frontMatterEnabled = frontMatterApi && frontMatterApi.getEnabledFeatures().contains('explorer');
    const frontMatterResolver = frontMatterEnabled
      ? frontMatterApi.getResolverFactory()?.createResolver('explorer')
      : null;

    // Filter out non-existent files from recentFiles
    this.data.recentFiles = this.data.recentFiles.filter(file => {
      const tfile = this.app.vault.getFileByPath(file.path);
      return tfile !== null;
    });

    this.data.recentFiles.forEach((currentFile) => {
      const navFile = childrenEl.createDiv({
        cls: 'tree-item nav-file recent-files-file',
      });
      const navFileTitle = navFile.createDiv({
        cls: 'tree-item-self is-clickable nav-file-title recent-files-title',
      });
      const navFileTitleContent = navFileTitle.createDiv({
        cls: 'tree-item-inner nav-file-title-content recent-files-title-content',
      });

      // If the Front Matter Title plugin is enabled, get the file's title from the plugin.
      const title = frontMatterResolver
        ? frontMatterResolver.resolve(currentFile.path) ?? currentFile.basename
        : currentFile.basename;
      navFileTitleContent.setText(title);

      if (openFile && currentFile.path === openFile.path) {
        navFileTitle.addClass('is-active');
      }

      navFileTitle.setAttr('draggable', 'true');
      navFileTitle.addEventListener('dragstart', (event: DragEvent) => {
        if (!currentFile?.path) return;

        const file = this.app.metadataCache.getFirstLinkpathDest(
          currentFile.path,
          '',
        );

        const dragManager = this.app.dragManager;
        const dragData = dragManager.dragFile(event, file as TFile);
        dragManager.onDragStart(event, dragData);
      });

      navFileTitle.addEventListener('mouseover', (event: MouseEvent) => {
        if (!currentFile?.path) return;

        this.app.workspace.trigger('hover-link', {
          event,
          source: RecentFilesListViewType,
          hoverParent: rootEl,
          targetEl: navFile,
          linktext: currentFile.path,
        });
      });

      navFileTitle.addEventListener('contextmenu', (event: MouseEvent) => {
        if (!currentFile?.path) return;

        const menu = new Menu();
        menu.addItem((item) =>
          item
            .setSection('action')
            .setTitle('Open in new tab')
            .setIcon('file-plus')
            .onClick(() => {
              this.focusFile(currentFile, 'tab');
            })
        );
        const file = this.app.vault.getFileByPath(currentFile?.path);
        this.app.workspace.trigger(
          'file-menu',
          menu,
          file,
          'link-context-menu',
        );
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
      });

      navFileTitleContent.addEventListener('mouseup', (event: MouseEvent) => {
        if (!currentFile) return;

        if (event.button === 0) {
          const newLeaf = Keymap.isModEvent(event)
          this.focusFile(currentFile, newLeaf);
        } else if (event.button === 1) {
          event.preventDefault();
          this.focusFile(currentFile, 'tab');
        }
      });

      const navFileDelete = navFileTitle.createDiv({
        cls: 'recent-files-file-delete',
      });
      setIcon(navFileDelete, 'lucide-x');
      navFileDelete.addEventListener('click', async (event) => {
        event.stopPropagation();
        await this.removeFile(currentFile);
        this.redraw();
      });
    });

    this.contentEl.setChildrenInPlace([rootEl]);
  };

  private readonly removeFile = async (file: FilePath): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(
      (currFile) => currFile.path !== file.path,
    );
    await this.plugin.pruneLength(); // Handles the save
  };

  private readonly updateData = async (file: TFile): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(
      (currFile) => currFile.path !== file.path,
    );
    this.data.recentFiles.unshift({
      basename: file.basename,
      path: file.path,
    });

    await this.plugin.pruneLength(); // Handles the save
  };

  private readonly update = async (openedFile: TFile): Promise<void> => {
    // Attempt to work around an Electron bug around file access when closing BrowserWindows.
    // https://github.com/electron/electron/issues/40607
    // https://discord.com/channels/686053708261228577/989603365606531104/1242215113969111211
    await sleep(100);

    if (!openedFile || !this.plugin.shouldAddFile(openedFile)) {
      return;
    }

    await this.updateData(openedFile);
    this.redraw();
  };

  /**
   * Open the provided file in the most recent leaf.
   *
   * @param shouldSplit Whether the file should be opened in a new split, or in
   * the most recent split. If the most recent split is pinned, this is set to
   * true.
   */
  private readonly focusFile = (file: FilePath, newLeaf: boolean | PaneType): void => {
    const targetFile = this.app.vault.getFileByPath(file.path);

    if (targetFile) {
      const leaf = this.app.workspace.getLeaf(newLeaf);
      leaf.openFile(targetFile);
    } else {
      new Notice(`The file ${file.path} didn't exist anymore. Removed`);
      this.data.recentFiles = this.data.recentFiles.filter(
        (fp) => fp.path !== file.path,
      );
      this.plugin.saveData();
      this.redraw();
    }
  };
}