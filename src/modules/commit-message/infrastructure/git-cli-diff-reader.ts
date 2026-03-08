import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitDiffReader } from '../application/contracts';

const execFileAsync = promisify(execFile);

export class GitCliDiffReader implements GitDiffReader {
	async readDiff(rootPath: string): Promise<string> {
		const stagedDiff = await this.runGitCommand(rootPath, ['diff', '--cached']);
		if (stagedDiff.trim()) {
			return stagedDiff;
		}

		return this.runGitCommand(rootPath, ['diff']);
	}

	private async runGitCommand(cwd: string, args: string[]): Promise<string> {
		try {
			const { stdout } = await execFileAsync('git', args, {
				cwd,
				maxBuffer: 10 * 1024 * 1024,
			});

			return stdout;
		} catch {
			throw new Error('Failed to read Git changes. Check whether this directory is a Git repository.');
		}
	}
}
