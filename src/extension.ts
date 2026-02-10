import * as vscode from "vscode";
import { generateCommitText } from "./ai";
import { readConfig } from "./config";
import { collectRepositoryChanges, getGitApi, pickRepository } from "./git";
import { buildPrompt } from "./prompt";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "autogitllm.generateCommitMessage",
    async (scmContext?: unknown) => {
      await runGenerateCommitMessage(scmContext);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // No resources to dispose.
}

async function runGenerateCommitMessage(scmContext?: unknown): Promise<void> {
  try {
    const config = readConfig();
    const gitApi = await getGitApi();

    if (!gitApi) {
      vscode.window.showErrorMessage("Git extension is unavailable or disabled in VS Code.");
      return;
    }

    const repository = pickRepository(gitApi.repositories, scmContext);
    if (!repository) {
      vscode.window.showErrorMessage("No Git repository found in the current workspace.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AutoGit LLM: Generating commit message",
        cancellable: false
      },
      async () => {
        const snapshot = await collectRepositoryChanges(repository.rootUri.fsPath, config);
        if (!snapshot.status.trim()) {
          vscode.window.showInformationMessage("No changes detected in this repository.");
          return;
        }

        const prompt = buildPrompt(snapshot, config);
        const commitMessage = await generateCommitText(prompt, config);

        repository.inputBox.value = commitMessage;

        if (config.copyToClipboard) {
          await vscode.env.clipboard.writeText(commitMessage);
        }

        vscode.window.showInformationMessage("Commit message generated and filled into Source Control input.");
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`AutoGit LLM failed: ${message}`);
  }
}
