import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

interface DefinitionSettings {
	filename: string;
	def_color: string;
}

const DEFAULT_SETTINGS: DefinitionSettings = {
	filename: "Definitions",
	def_color: "#0000FF",
};

const def_dict: any = {
	test: "This is a test definition.",
};

export default class DefinitionPlugin extends Plugin {
	settings: DefinitionSettings;

	async scanDefinitions() {
		let counter = 0;

		const files = this.app.vault.getMarkdownFiles();
		for (let file of files) {
			if (file.basename === this.settings.filename) {
				await this.app.vault.read(file).then((content: string) => {
					const lines = content.split("\n");
					for (let line of lines) {
						if (line.contains(":")) {
							const [left, right] = line.split(":");

							const words_left = left
								.replace(/[*_#´]/g, "")
								.split(",");
							for (let word of words_left) {
								const word_trim = word.trim();
								def_dict[word_trim.toLowerCase()] = right;
							}
							counter++;
						}
					}

					// write json to new file for debug purposes
					// const newPath = file.path.replace(".md", "_json.md");
					// this.app.vault.create(newPath, JSON.stringify(def_dict));
				});
			}
		}
		new Notice("Found " + counter.toString() + " definitions.");
	}

	getDefinition(term: string) {
		const lowercaseTerm = term.toLowerCase();
		const singularTerm =
			lowercaseTerm.charAt(lowercaseTerm.length - 1) !== "s"
				? lowercaseTerm
				: lowercaseTerm.slice(0, -1);
		const pluralTerm = singularTerm + "s";

		if (singularTerm in def_dict) return def_dict[singularTerm];
		return def_dict[pluralTerm];
	}

	async onload() {
		await this.loadSettings();

		this.scanDefinitions();
		this.addRibbonIcon("list-restart", "Rescan Definitions", () => {
			this.scanDefinitions();
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			view?.previewMode.rerender(true);
		});

		this.registerMarkdownPostProcessor((el, ctx) => {
			const codeblocks = el.findAll("code");
			for (let codeblock of codeblocks) {
				const text = codeblock.innerText.trim();
				if (text[0] === "%" && text[text.length - 1] === "%") {
					const term = text.substring(1, text.length - 1).trim();
					const newText = codeblock.createSpan({
						text: term,
						cls: "definition",
					});
					newText.style.color = this.settings.def_color;

					newText.addEventListener("mouseenter", () => {
						// Create and show a tooltip on mouseenter
						const tooltip = document.createElement("div");
						const def = this.getDefinition(term);
						tooltip.textContent = def
							? def
							: "No definition found :/";

						tooltip.classList.add("tooltip");

						document.body.appendChild(tooltip);

						// Position the tooltip relative to the hovered element
						const rect = newText.getBoundingClientRect();
						tooltip.style.left = rect.left + "px";
						tooltip.style.top = rect.bottom + window.scrollY + "px";
					});

					newText.addEventListener("mouseleave", () => {
						const tooltip = document.querySelector(".tooltip");
						if (tooltip) {
							tooltip.remove();
						}
					});
					codeblock.replaceWith(newText);
				}
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					menu.addItem((item) => {
						item.setIcon("list-restart");
						item.setTitle("Scan for unmarked definitions");
						item.onClick(async () => {
							await this.app.vault
								.read(file)
								.then((content: string) => {
									let contentCopy = content;
									for (const [term, _] of Object.entries(
										def_dict
									)) {
										contentCopy = contentCopy.replace(
											new RegExp(term, "gi"),
											"`%" + term + "%`"
										);
									}
									contentCopy = contentCopy
										.replace(
											new RegExp("`%" + "`%", "gi"),
											"`%"
										)
										.replace(
											new RegExp("\\[\\[" + "`%", "gi"),
											"[["
										)
										.replace(
											new RegExp("%`" + "%`", "gi"),
											"%`"
										)
										.replace(
											new RegExp("%`" + "\\]\\]", "gi"),
											"]]"
										);

									const newPath = file.path.replace(
										".md",
										"_copy.md"
									);
									this.app.vault.create(newPath, contentCopy);
								});
						});
					});
				}
			})
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: DefinitionPlugin;

	constructor(app: App, plugin: DefinitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Definitions File Name")
			.setDesc(
				"Markdown files with this name will be scanned for definitions."
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.filename)
					.onChange(async (value) => {
						this.plugin.settings.filename = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Definition Color")
			.setDesc("")
			.addColorPicker((cb) => {
				cb.setValue(this.plugin.settings.def_color).onChange(
					async (value) => {
						this.plugin.settings.def_color = value;
						await this.plugin.saveSettings();
					}
				);
			});
	}
}
