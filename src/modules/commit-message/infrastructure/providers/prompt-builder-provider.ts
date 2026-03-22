import { readFile } from 'node:fs/promises';
import { PromptBuilderProvider } from '../../application/contracts';

type PromptTemplateCache = {
	systemTemplate?: string;
	userTemplate?: string;
};

export class MarkdownPromptBuilderProvider implements PromptBuilderProvider {
	private readonly cache: PromptTemplateCache = {};

	constructor(
		private readonly systemTemplatePath: string,
		private readonly userTemplatePath: string,
	) {}

	async buildSystemPrompt(): Promise<string> {
		const template = await this.readTemplate('systemTemplate', this.systemTemplatePath);
		return template.trim();
	}

	async buildUserPrompt(input: string): Promise<string> {
		const template = await this.readTemplate('userTemplate', this.userTemplatePath);
		const wrappedInput = this.wrapInputWithXmlTag(input);

		return template.replace(/<INPUT>\s*<\/INPUT>/, wrappedInput).trim();
	}

	private async readTemplate(
		cacheKey: keyof PromptTemplateCache,
		templatePath: string,
	): Promise<string> {
		if (this.cache[cacheKey]) {
			return this.cache[cacheKey];
		}

		const template = await readFile(templatePath, 'utf-8');
		this.cache[cacheKey] = template;
		return template;
	}

	private wrapInputWithXmlTag(input: string): string {
		return `<INPUT>\n${input}\n</INPUT>`;
	}
}
