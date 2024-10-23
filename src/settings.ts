import { App, PluginSettingTab, Setting } from 'obsidian';
import type RecentFilesPlugin from './main.ts';
import { defaultMaxLength } from './data.ts';
import { createDonateButton, paypal, buyMeACoffee } from './ui.ts';

export default class RecentFilesSettingTab extends PluginSettingTab {
  readonly plugin: RecentFilesPlugin;

  constructor(app: App, plugin: RecentFilesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Recent Files List' });

    const content = `
      RegExp patterns to ignore. One pattern per line. See 
      <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern">
        MDN - Regular expressions
      </a> for help.
    `;

    const fragment = createFragment((el) => {
      el.createEl('div').innerHTML = content;
    });

    new Setting(containerEl)
      .setName('Omitted pathname patterns')
      .setDesc(fragment)
      .addTextArea((textArea) => {
        const inputEl = textArea.inputEl;
        inputEl.setAttr('rows', 6);

        textArea
          .setPlaceholder('^daily/\n\\.png$\nfoobar.*baz')
          .setValue(this.plugin.data.omittedPaths.join('\n'));
        inputEl.onblur = async () => {
          const patterns = inputEl.value;
          this.plugin.data.omittedPaths = patterns.split('\n').map(pattern => pattern.trim()).filter(pattern => pattern !== '');// no empty lines
          await this.plugin.pruneOmittedFiles();
          this.plugin.view.redraw();
        };
      });

      new Setting(containerEl)
      .setName('Omitted frontmatter tags')
      .setDesc('Frontmatter tags patterns to ignore. One pattern per line.')
      .addTextArea((textArea) => {
        const inputEl = textArea.inputEl;
        inputEl.setAttr('rows', 6);
        textArea
          .setPlaceholder('daily\nignore')
          .setValue(this.plugin.data.omittedTags.join('\n'));
        inputEl.onblur = async () => {
          const patterns = inputEl.value;
          this.plugin.data.omittedTags = patterns.split('\n')
            .map(pattern => pattern.trim())
            .filter(pattern => pattern !== '');// no empty lines
          await this.plugin.pruneOmittedFiles();
          this.plugin.view.redraw();
        };
      });

    new Setting(containerEl)
      .setName('List length')
      .setDesc('Maximum number of filenames to keep in the list.')
      .addText((text) => {
        const inputEl = text.inputEl;
        const MAX_ALLOWED = 1000;

        inputEl.setAttr('type', 'number')
        inputEl.setAttr('min', '1');
        inputEl.setAttr('max', String(MAX_ALLOWED));

        text
          .setPlaceholder(String(defaultMaxLength))
          .setValue(this.plugin.data.maxLength?.toString() || '')

        // Wrong entries automatically avoided  
        const validateInput = (value: string) => {
          if (value === '') {
            text.setValue(value)
            return
          }

          if (/[eE.-]/.test(value)) {
            text.setValue(value.replace(/[eE.-]/g, ''));
            return
          }

          const parsed = parseInt(value, 10);
          if (parsed > MAX_ALLOWED) {
            text.setValue(MAX_ALLOWED.toString())
          } else if (parsed === 0) {
            text.setValue('');
          }
          return
        };

        text.onChange((value) => {
          validateInput(value);
        });

        inputEl.onblur = async () => {
          const value = inputEl.value;
          if (value === '') {
            if (this.plugin.data.maxLength === null) {
              return
            }
            this.plugin.data.maxLength = null;
            inputEl.value = '';
          } else {
            const parsed = parseInt(value, 10);
            this.plugin.data.maxLength = parsed;
          }

          await this.plugin.pruneLength();
          this.plugin.view.redraw();
        };
      });

    const div = containerEl.createEl('div', {
      cls: 'recent-files-donation',
    });

    const donateText = document.createElement('p');
    donateText.appendText(
      'If this plugin adds value for you and you would like to help support ' +
      'continued development, please use the buttons below:',
    );
    div.appendChild(donateText);

    const parser = new DOMParser();

    div.appendChild(
      createDonateButton(
        'https://paypal.me/tgrosinger',
        parser.parseFromString(paypal, 'text/xml').documentElement,
      ),
    );

    div.appendChild(
      createDonateButton(
        'https://www.buymeacoffee.com/tgrosinger',
        parser.parseFromString(buyMeACoffee, 'text/xml').documentElement,
      ),
    );
  }
}
