type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

type FileCategory =
	| 'business'
	| 'test'
	| 'config'
	| 'style'
	| 'docs'
	| 'lock/deps'
	| 'other';

type FileMetadata = {
	path: string;
	previousPath?: string;
	changeType: ChangeType;
	additions: number;
	deletions: number;
	extension: string;
	areas: Set<string>;
	signals: Set<string>;
	symbols: Set<string>;
};

type ScoredFileMetadata = FileMetadata & {
	category: FileCategory;
	score: number;
};

type DiffCompressionBudget = {
	maxInputTokens: number;
	maxInputChars: number;
};

type DiffSummaryResult = {
	summary: string;
	files: ScoredFileMetadata[];
	budget: DiffCompressionBudget;
};

type SummaryDetailLevel = 'full' | 'compact' | 'minimal';

const DEFAULT_MAX_INPUT_TOKENS = 320;
const MAX_FILE_SUMMARIES = 12;
const MAX_SYMBOLS_PER_FILE = 4;
const MAX_AREAS = 6;
const CATEGORY_WEIGHTS: Record<FileCategory, number> = {
	business: 40,
	test: 28,
	config: 22,
	style: 18,
	docs: 14,
	'lock/deps': 10,
	other: 8,
};
const CHANGE_TYPE_BONUSES: Record<ChangeType, number> = {
	added: 4,
	modified: 3,
	deleted: 5,
	renamed: 5,
};
const CHARS_PER_TOKEN_APPROX = 12;

export class GitDiffMetadataExtractor {
	extract(diff: string, options?: { maxInputTokens?: number }): string {
		return this.extractSummary(diff, options).summary;
	}

	extractSummary(diff: string, options?: { maxInputTokens?: number }): DiffSummaryResult {
		const normalizedDiff = diff.trim();
		const budget = this.buildBudget(options?.maxInputTokens);
		if (!normalizedDiff) {
			return {
				summary: '',
				files: [],
				budget,
			};
		}

		const files = this.parseFiles(normalizedDiff).map((file) => this.scoreFile(file));
		if (files.length === 0) {
			return {
				summary: this.buildFallbackSummary(normalizedDiff, budget),
				files: [],
				budget,
			};
		}

		const sortedFiles = [...files].sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}

			const rightChanges = right.additions + right.deletions;
			const leftChanges = left.additions + left.deletions;
			if (rightChanges !== leftChanges) {
				return rightChanges - leftChanges;
			}

			return left.path.localeCompare(right.path);
		});

		return {
			summary: this.buildSummaryWithinBudget(sortedFiles, budget),
			files: sortedFiles,
			budget,
		};
	}

	private buildBudget(maxInputTokens?: number): DiffCompressionBudget {
		const normalizedMaxInputTokens = Math.max(48, maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS);
		return {
			maxInputTokens: normalizedMaxInputTokens,
			maxInputChars: normalizedMaxInputTokens * CHARS_PER_TOKEN_APPROX,
		};
	}

	private buildSummaryWithinBudget(
		files: ScoredFileMetadata[],
		budget: DiffCompressionBudget,
	): string {
		const maxFileCount = Math.min(files.length, MAX_FILE_SUMMARIES);
		const detailLevels: SummaryDetailLevel[] = ['full', 'compact', 'minimal'];

		for (const detailLevel of detailLevels) {
			for (let fileCount = maxFileCount; fileCount >= 1; fileCount -= 1) {
				const candidate = this.serializeSummary(files, fileCount, detailLevel);
				if (candidate.length <= budget.maxInputChars) {
					return candidate;
				}
			}
		}

		return this.serializeSummary(files, 1, 'minimal').slice(0, budget.maxInputChars).trimEnd();
	}

	private serializeSummary(
		files: ScoredFileMetadata[],
		fileCount: number,
		detailLevel: SummaryDetailLevel,
	): string {
		const includedFiles = files.slice(0, fileCount);
		const omittedFiles = files.slice(fileCount);
		const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
		const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
		const changeTypeCounts = this.countByChangeType(files);
		const topAreas = this.collectTopAreas(files);
		const topCategories = this.collectTopCategories(files);

		const lines = [
			'Static diff metadata extracted from git changes.',
			`Files changed: ${files.length}`,
			`Change types: added ${changeTypeCounts.added}, modified ${changeTypeCounts.modified}, deleted ${changeTypeCounts.deleted}, renamed ${changeTypeCounts.renamed}`,
			`Line stats: +${totalAdditions} -${totalDeletions}`,
			`Priority categories: ${topCategories.join(', ')}`,
		];

		if (topAreas.length > 0) {
			lines.push(`Top areas: ${topAreas.join(', ')}`);
		}

		lines.push('Prioritized file summaries:');
		for (const file of includedFiles) {
			lines.push(this.formatFileSummary(file, detailLevel));
		}

		if (omittedFiles.length > 0) {
			lines.push(this.formatOmittedSummary(omittedFiles));
		}

		return lines.join('\n');
	}

	private parseFiles(diff: string): FileMetadata[] {
		const sections = diff
			.split(/^diff --git /m)
			.map((section) => section.trim())
			.filter(Boolean);

		return sections
			.map((section) => this.parseSection(section))
			.filter((file): file is FileMetadata => file !== null);
	}

	private parseSection(section: string): FileMetadata | null {
		const lines = section.split('\n');
		const headerMatch = lines[0]?.match(/^a\/(.+?) b\/(.+)$/);
		if (!headerMatch) {
			return null;
		}

		let previousPath = headerMatch[1];
		let nextPath = headerMatch[2];
		let changeType: ChangeType = 'modified';
		let additions = 0;
		let deletions = 0;
		const areas = new Set<string>();
		const signals = new Set<string>();
		const symbols = new Set<string>();

		for (const rawLine of lines.slice(1)) {
			if (rawLine.startsWith('new file mode ')) {
				changeType = 'added';
				continue;
			}

			if (rawLine.startsWith('deleted file mode ')) {
				changeType = 'deleted';
				continue;
			}

			const renameFromMatch = rawLine.match(/^rename from (.+)$/);
			if (renameFromMatch) {
				changeType = 'renamed';
				previousPath = renameFromMatch[1];
				continue;
			}

			const renameToMatch = rawLine.match(/^rename to (.+)$/);
			if (renameToMatch) {
				changeType = 'renamed';
				nextPath = renameToMatch[1];
				continue;
			}

			if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('@@')) {
				continue;
			}

			if (rawLine.startsWith('+')) {
				additions += 1;
				this.collectSignals(rawLine.slice(1), nextPath, areas, signals, symbols);
				continue;
			}

			if (rawLine.startsWith('-')) {
				deletions += 1;
				this.collectSignals(rawLine.slice(1), nextPath, areas, signals, symbols);
			}
		}

		this.collectPathSignals(nextPath, areas, signals);

		return {
			path: nextPath,
			previousPath: previousPath !== nextPath ? previousPath : undefined,
			changeType,
			additions,
			deletions,
			extension: this.getExtension(nextPath),
			areas,
			signals,
			symbols,
		};
	}

	private scoreFile(file: FileMetadata): ScoredFileMetadata {
		const category = this.classifyCategory(file.path, file.extension);
		const changedLines = file.additions + file.deletions;
		const sizeScore = Math.min(24, Math.round(Math.sqrt(Math.max(1, changedLines)) * 2));
		const score = CATEGORY_WEIGHTS[category] + CHANGE_TYPE_BONUSES[file.changeType] + sizeScore;

		return {
			...file,
			category,
			score,
		};
	}

	private classifyCategory(path: string, extension: string): FileCategory {
		const normalizedPath = path.toLowerCase();

		if (
			/(^|\/)__tests__(\/|$)/.test(normalizedPath) ||
			/\.(test|spec)\.[a-z0-9]+$/i.test(normalizedPath)
		) {
			return 'test';
		}

		if (
			/(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i.test(normalizedPath)
		) {
			return 'lock/deps';
		}

		if (/\.(md|mdx|txt)$/i.test(normalizedPath) || /readme/i.test(normalizedPath)) {
			return 'docs';
		}

		if (
			/\.(css|scss|sass|less)$/i.test(normalizedPath) ||
			/\.styled\.[a-z0-9]+$/i.test(normalizedPath)
		) {
			return 'style';
		}

		if (
			normalizedPath === 'dockerfile' ||
			/(^|\/)\.env(\.|$)/.test(normalizedPath) ||
			/(config|tsconfig|eslint|prettier|vite|webpack)/i.test(normalizedPath) ||
			['json', 'yaml', 'yml', 'toml', 'ini'].includes(extension)
		) {
			return 'config';
		}

		if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cs', 'go', 'rb', 'php'].includes(extension)) {
			return 'business';
		}

		return 'other';
	}

	private collectSignals(
		line: string,
		path: string,
		areas: Set<string>,
		signals: Set<string>,
		symbols: Set<string>,
	): void {
		this.collectPathSignals(path, areas, signals);

		const normalizedLine = line.trim();
		if (!normalizedLine) {
			return;
		}

		const symbolPatterns = [
			/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
			/(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
			/export\s+class\s+([A-Za-z0-9_]+)/,
			/class\s+([A-Za-z0-9_]+)/,
			/export\s+interface\s+([A-Za-z0-9_]+)/,
			/export\s+type\s+([A-Za-z0-9_]+)/,
			/export\s+const\s+([A-Za-z0-9_]+)/,
			/const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/,
		];

		for (const pattern of symbolPatterns) {
			const match = normalizedLine.match(pattern);
			if (match?.[1]) {
				symbols.add(match[1]);
			}
		}

		if (/\bdescribe\s*\(|\bit\s*\(|\btest\s*\(/.test(normalizedLine)) {
			signals.add('tests');
		}

		if (/^\s*#|^\s*[-*]\s|\bREADME\b/i.test(normalizedLine)) {
			signals.add('documentation');
		}

		if (/"(?:dependencies|devDependencies|peerDependencies)"/.test(normalizedLine)) {
			signals.add('dependencies');
		}

		if (/\buse[A-Z][A-Za-z0-9_]*\b/.test(normalizedLine)) {
			signals.add('hooks');
		}

		if (/\b(route|router|endpoint|controller|handler)\b/i.test(normalizedLine)) {
			signals.add('api');
		}

		if (/\b(schema|validator|zod|yup)\b/i.test(normalizedLine)) {
			signals.add('validation');
		}
	}

	private collectPathSignals(path: string, areas: Set<string>, signals: Set<string>): void {
		const normalizedPath = path.replace(/^b\//, '');
		const pathSegments = normalizedPath.split('/');
		const topArea = pathSegments.slice(0, 2).join('/');
		if (topArea) {
			areas.add(topArea);
		}

		if (/(\.|\/)(test|spec)\./i.test(normalizedPath) || normalizedPath.includes('__tests__')) {
			signals.add('tests');
		}

		if (/\.(md|mdx|txt)$/i.test(normalizedPath) || /README/i.test(normalizedPath)) {
			signals.add('documentation');
		}

		if (/(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i.test(normalizedPath)) {
			signals.add('dependencies');
		}

		if (/(config|tsconfig|eslint|prettier|vite|webpack|babel)/i.test(normalizedPath)) {
			signals.add('configuration');
		}
	}

	private formatFileSummary(file: ScoredFileMetadata, detailLevel: SummaryDetailLevel): string {
		const baseParts = [
			`- score ${file.score} | ${file.category} | ${file.changeType} ${file.path} [${file.extension}] +${file.additions} -${file.deletions}`,
		];

		if (detailLevel !== 'minimal' && file.previousPath) {
			baseParts.push(`from ${file.previousPath}`);
		}

		if (detailLevel === 'full') {
			const signals = Array.from(file.signals).slice(0, 4);
			if (signals.length > 0) {
				baseParts.push(`signals: ${signals.join(', ')}`);
			}

			const symbols = Array.from(file.symbols).slice(0, MAX_SYMBOLS_PER_FILE);
			if (symbols.length > 0) {
				baseParts.push(`symbols: ${symbols.join(', ')}`);
			}
		}

		if (detailLevel === 'compact') {
			const signals = Array.from(file.signals).slice(0, 2);
			if (signals.length > 0) {
				baseParts.push(`signals: ${signals.join(', ')}`);
			}
		}

		return baseParts.join(' | ');
	}

	private formatOmittedSummary(files: ScoredFileMetadata[]): string {
		const byCategory = new Map<FileCategory, number>();
		const byArea = new Map<string, number>();

		for (const file of files) {
			byCategory.set(file.category, (byCategory.get(file.category) ?? 0) + 1);
			for (const area of file.areas) {
				byArea.set(area, (byArea.get(area) ?? 0) + 1);
			}
		}

		const categorySummary = Array.from(byCategory.entries())
			.sort((left, right) => right[1] - left[1])
			.map(([category, count]) => `${category} ${count}`)
			.join(', ');
		const areaSummary = Array.from(byArea.entries())
			.sort((left, right) => right[1] - left[1])
			.slice(0, 3)
			.map(([area, count]) => `${area} ${count}`)
			.join(', ');

		return `Omitted files: ${files.length} | categories: ${categorySummary}${areaSummary ? ` | areas: ${areaSummary}` : ''}`;
	}

	private countByChangeType(files: Array<FileMetadata | ScoredFileMetadata>): Record<ChangeType, number> {
		return files.reduce<Record<ChangeType, number>>(
			(counts, file) => {
				counts[file.changeType] += 1;
				return counts;
			},
			{
				added: 0,
				modified: 0,
				deleted: 0,
				renamed: 0,
			},
		);
	}

	private collectTopAreas(files: Array<FileMetadata | ScoredFileMetadata>): string[] {
		const scores = new Map<string, number>();

		for (const file of files) {
			for (const area of file.areas) {
				scores.set(area, (scores.get(area) ?? 0) + file.additions + file.deletions + 1);
			}
		}

		return Array.from(scores.entries())
			.sort((left, right) => right[1] - left[1])
			.slice(0, MAX_AREAS)
			.map(([area]) => area);
	}

	private collectTopCategories(files: ScoredFileMetadata[]): FileCategory[] {
		const scores = new Map<FileCategory, number>();
		for (const file of files) {
			scores.set(file.category, (scores.get(file.category) ?? 0) + file.score);
		}

		return Array.from(scores.entries())
			.sort((left, right) => right[1] - left[1])
			.map(([category]) => category);
	}

	private getExtension(path: string): string {
		const match = path.match(/\.([A-Za-z0-9]+)$/);
		return match?.[1]?.toLowerCase() ?? 'no-ext';
	}

	private buildFallbackSummary(diff: string, budget: DiffCompressionBudget): string {
		const preview = diff.slice(0, Math.min(2_000, budget.maxInputChars)).trimEnd();
		return ['Static diff metadata fallback.', 'Raw preview:', preview].join('\n');
	}
}
