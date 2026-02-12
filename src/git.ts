import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { ChangeSnapshot, ExtensionConfig } from "./types";

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitAPI;
}

export interface GitAPI {
  readonly repositories: GitRepository[];
}

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: {
    value: string;
  };
}

const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export async function getGitApi(): Promise<GitAPI | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    return undefined;
  }

  const gitExtension = extension.isActive ? extension.exports : await extension.activate();
  if (!gitExtension.enabled) {
    return undefined;
  }

  return gitExtension.getAPI(1);
}

export function pickRepository(repositories: readonly GitRepository[], scmContext?: unknown): GitRepository | undefined {
  if (repositories.length === 0) {
    return undefined;
  }

  const fromContext = extractContextRoot(scmContext);
  if (fromContext) {
    const found = repositories.find((repo) => sameFsPath(repo.rootUri.fsPath, fromContext.fsPath));
    if (found) {
      return found;
    }
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === "file") {
    const sorted = [...repositories].sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length);
    const found = sorted.find((repo) => isPathInside(activeUri.fsPath, repo.rootUri.fsPath));
    if (found) {
      return found;
    }
  }

  return repositories[0];
}

export async function collectRepositoryChanges(
  repositoryPath: string,
  config: ExtensionConfig
): Promise<ChangeSnapshot> {
  const status = await runGit(["status", "--short"], repositoryPath, config.commandTimeoutMs);

  const stagedFiles = parseLines(
    await runGit(["diff", "--name-only", "--staged"], repositoryPath, config.commandTimeoutMs)
  );
  const unstagedFiles = config.includeOnlyStaged
    ? []
    : parseLines(await runGit(["diff", "--name-only"], repositoryPath, config.commandTimeoutMs));
  const untrackedFiles = config.includeOnlyStaged
    ? []
    : parseLines(
        await runGit(["ls-files", "--others", "--exclude-standard"], repositoryPath, config.commandTimeoutMs)
      );

  const allChangedFiles = uniqueLines([...stagedFiles, ...unstagedFiles, ...untrackedFiles]);
  const limitedFiles = allChangedFiles.slice(0, config.maxChangedFiles);
  const wasFileLimited = allChangedFiles.length > limitedFiles.length;

  const stagedSet = new Set(stagedFiles);
  const unstagedSet = new Set(unstagedFiles);
  const untrackedSet = new Set(untrackedFiles);

  const diffParts: string[] = [];
  for (const filePath of limitedFiles) {
    const sections: string[] = [];

    if (stagedSet.has(filePath)) {
      const stagedDiff = await runGit(
        ["diff", "--staged", "--no-color", "--no-ext-diff", "--", filePath],
        repositoryPath,
        config.commandTimeoutMs
      );
      if (stagedDiff.trim()) {
        sections.push(`# Staged diff\n${stagedDiff}`);
      }
    }

    if (unstagedSet.has(filePath)) {
      const unstagedDiff = await runGit(
        ["diff", "--no-color", "--no-ext-diff", "--", filePath],
        repositoryPath,
        config.commandTimeoutMs
      );
      if (unstagedDiff.trim()) {
        sections.push(`# Unstaged diff\n${unstagedDiff}`);
      }
    }

    if (untrackedSet.has(filePath)) {
      const untrackedContent = await readUntrackedFileContent(join(repositoryPath, filePath));
      if (untrackedContent.trim()) {
        sections.push(`# Untracked file content\n${untrackedContent}`);
      }
    }

    if (sections.length > 0) {
      diffParts.push(`## ${filePath}\n${sections.join("\n\n")}`);
    }
  }

  const merged = diffParts.join("\n\n");
  const trimmed = config.truncateDiff ? trimUtf8(merged, config.maxDiffBytes) : { text: merged, truncated: false };

  return {
    status,
    diff: trimmed.text,
    wasTruncated: trimmed.truncated,
    wasFileLimited,
    totalChangedFiles: allChangedFiles.length,
    includedChangedFiles: limitedFiles.length
  };
}

function runGit(args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.quotepath=false", ...args],
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: GIT_MAX_BUFFER_BYTES
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || error.message;
          reject(new Error(`git ${args.join(" ")} failed: ${details}`));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of lines) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    output.push(line);
  }

  return output;
}

async function readUntrackedFileContent(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return "[Skipped non-regular file]";
    }

    const buffer = await fs.readFile(filePath);
    if (looksBinary(buffer)) {
      return "[Skipped binary file]";
    }

    const text = buffer.toString("utf8");
    return text.trim() || "[Empty text file]";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `[Untracked file unavailable: ${reason}]`;
  }
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  if (buffer.includes(0)) {
    return true;
  }

  const sampleSize = Math.min(buffer.length, 1024);
  let nonTextCount = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    const byte = buffer[i];
    const isControl = byte < 32 && byte !== 9 && byte !== 10 && byte !== 13;
    if (isControl) {
      nonTextCount += 1;
    }
  }

  return nonTextCount / sampleSize > 0.1;
}

function trimUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) {
    return { text, truncated: false };
  }

  const buffer = Buffer.from(text, "utf8");
  const sliced = buffer.subarray(0, maxBytes).toString("utf8");
  return {
    text: `${sliced}\n\n[Diff truncated due to maxDiffBytes limit]`,
    truncated: true
  };
}

function extractContextRoot(value: unknown): vscode.Uri | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const maybeRoot = (value as { rootUri?: unknown }).rootUri;
  if (maybeRoot instanceof vscode.Uri) {
    return maybeRoot;
  }

  return undefined;
}

function isPathInside(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedRoot = normalizePath(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function sameFsPath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
