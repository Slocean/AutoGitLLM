import * as vscode from 'vscode';
import { generateCommitText } from './ai';
import { readConfig } from './config';
import { collectRepositoryChanges, getGitApi, pickRepository } from './git';
import { providerLabel, t } from './i18n';
import { buildPrompt } from './prompt';
import { openSetupWizard } from './setupWizard';
import { ExtensionConfig, UiLanguage } from './types';

interface SetupIssueAction {
  kind: 'setup' | 'setting';
  label: string;
  setting?: string;
}

interface SetupIssue {
  message: string;
  actions: SetupIssueAction[];
}

export function activate(context: vscode.ExtensionContext): void {
  const generateDisposable = vscode.commands.registerCommand(
    'gitgathom.generateCommitMessage',
    async (scmContext?: unknown) => {
      await runGenerateCommitMessage(scmContext);
    }
  );

  const setupDisposable = vscode.commands.registerCommand('gitgathom.openSetup', async () => {
    await runSetupWizard();
  });

  context.subscriptions.push(generateDisposable, setupDisposable);
}

export function deactivate(): void {
  // No resources to dispose.
}

async function runGenerateCommitMessage(scmContext?: unknown): Promise<void> {
  const config = readConfig();

  try {
    const setupIssue = getSetupIssue(config);
    if (setupIssue) {
      await promptForSetup(config.language, setupIssue);
      return;
    }

    const gitApi = await getGitApi();

    if (!gitApi) {
      vscode.window.showErrorMessage(t(config.language, 'gitUnavailable'));
      return;
    }

    const repository = pickRepository(gitApi.repositories, scmContext);
    if (!repository) {
      vscode.window.showErrorMessage(t(config.language, 'noRepo'));
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t(config.language, 'progressTitle'),
        cancellable: false
      },
      async () => {
        const snapshot = await collectRepositoryChanges(repository.rootUri.fsPath, config);
        if (!snapshot.status.trim()) {
          vscode.window.showInformationMessage(t(config.language, 'noChanges'));
          return;
        }

        const prompt = buildPrompt(snapshot, config);
        const commitMessage = await generateCommitText(prompt, config);

        repository.inputBox.value = commitMessage;

        if (config.copyToClipboard) {
          await vscode.env.clipboard.writeText(commitMessage);
        }

        vscode.window.showInformationMessage(t(config.language, 'generated'));
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`${t(config.language, 'failedPrefix')}${message}`);
  }
}

async function runSetupWizard(): Promise<void> {
  const before = readConfig().language;
  const saved = await openSetupWizard(before);
  const after = readConfig().language;

  if (saved) {
    vscode.window.showInformationMessage(t(after, 'wizardSaved'));
    return;
  }

  vscode.window.showInformationMessage(t(after, 'wizardCancelled'));
}

function getSetupIssue(config: ExtensionConfig): SetupIssue | undefined {
  const provider = providerLabel(config.language, config.provider);

  if (config.provider === 'custom' && !config.baseUrl.trim()) {
    return {
      message: t(config.language, 'setupMissingBaseUrl', { provider }),
      actions: [
        { kind: 'setup', label: t(config.language, 'actionOpenSetup') },
        { kind: 'setting', label: t(config.language, 'actionOpenSettings'), setting: 'gitgathom' },
        { kind: 'setting', label: t(config.language, 'actionConfigureBaseUrl'), setting: 'gitgathom.baseUrl' },
        { kind: 'setting', label: t(config.language, 'actionConfigureProvider'), setting: 'gitgathom.provider' }
      ]
    };
  }

  const hasCredential =
    config.provider === 'gemini'
      ? Boolean(config.apiKey)
      : Boolean(config.apiKey) ||
        hasHeader(config.extraHeaders, 'authorization') ||
        hasHeader(config.extraHeaders, 'x-api-key');

  if (!hasCredential) {
    return {
      message: t(config.language, 'setupMissingCredential', { provider }),
      actions: [
        { kind: 'setup', label: t(config.language, 'actionOpenSetup') },
        { kind: 'setting', label: t(config.language, 'actionOpenSettings'), setting: 'gitgathom' },
        { kind: 'setting', label: t(config.language, 'actionConfigureApiKey'), setting: 'gitgathom.apiKey' },
        { kind: 'setting', label: t(config.language, 'actionConfigureHeaders'), setting: 'gitgathom.extraHeaders' }
      ]
    };
  }

  return undefined;
}

async function promptForSetup(language: UiLanguage, issue: SetupIssue): Promise<void> {
  const selected = await vscode.window.showWarningMessage(
    issue.message,
    ...issue.actions.map(action => action.label)
  );
  const target = issue.actions.find(action => action.label === selected);

  if (!target) {
    return;
  }

  if (target.kind === 'setup') {
    await runSetupWizard();
    return;
  }

  if (target.setting) {
    await vscode.commands.executeCommand('workbench.action.openSettings', target.setting);
    return;
  }

  await vscode.commands.executeCommand('workbench.action.openSettings', 'gitgathom');
}

function hasHeader(headers: Record<string, string>, keyToFind: string): boolean {
  const target = keyToFind.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === target);
}
