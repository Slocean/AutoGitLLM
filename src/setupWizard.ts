import * as vscode from 'vscode';
import { getDefaultModel, getSuggestedModels } from './config';
import { providerLabel, t } from './i18n';
import { Provider, UiLanguage } from './types';

const CONFIG_ROOT = 'gitgathom';
const PROVIDERS: Provider[] = ['openai', 'deepseek', 'gemini', 'kimi', 'glm', 'custom'];

export async function openSetupWizard(currentLanguage: UiLanguage): Promise<boolean> {
  const language = await pickLanguage(currentLanguage);
  if (!language) {
    return false;
  }

  await updateSetting('language', language);

  const cfg = vscode.workspace.getConfiguration(CONFIG_ROOT);
  const currentProvider = cfg.get<Provider>('provider', 'openai');
  const provider = await pickProvider(language, currentProvider);
  if (!provider) {
    return false;
  }

  await updateSetting('provider', provider);

  const currentModel = cfg.get<string>('model', '').trim();
  const model = await pickModel(language, provider, currentProvider, currentModel);
  if (model === undefined) {
    return false;
  }

  await updateSetting('model', model.trim());

  const apiKey = await vscode.window.showInputBox({
    prompt: t(language, 'wizardApiKeyPrompt'),
    placeHolder: t(language, 'wizardApiKeyPlaceholder'),
    password: true,
    ignoreFocusOut: true
  });
  if (apiKey === undefined) {
    return false;
  }

  if (apiKey.trim()) {
    await updateSetting('apiKey', apiKey.trim());
  }

  const currentBaseUrl = cfg.get<string>('baseUrl', '').trim();
  const baseUrl = await vscode.window.showInputBox({
    prompt: t(language, 'wizardBaseUrlPrompt'),
    placeHolder: t(language, 'wizardBaseUrlPlaceholder'),
    value: currentBaseUrl,
    validateInput: value => {
      if (provider !== 'custom') {
        return undefined;
      }
      return value.trim() ? undefined : t(language, 'wizardBaseUrlRequired');
    }
  });
  if (baseUrl === undefined) {
    return false;
  }

  await updateSetting('baseUrl', baseUrl.trim());

  if (provider === 'openai') {
    const currentPath = cfg.get<string>('customRequestPath', '').trim();
    const suggestedPath = currentPath || '/chat/completions';
    const requestPath = await vscode.window.showInputBox({
      prompt: t(language, 'wizardPathPrompt'),
      placeHolder: t(language, 'wizardPathPlaceholder'),
      value: normalizeRequestPath(suggestedPath)
    });
    if (requestPath === undefined) {
      return false;
    }

    const normalizedPath = normalizeRequestPath(requestPath);
    await updateSetting('customRequestPath', normalizedPath);
  } else {
    await updateSetting('customRequestPath', '');
  }

  const currentHeaders = cfg.get<string>('extraHeaders', '{}').trim();
  const extraHeaders = await vscode.window.showInputBox({
    prompt: t(language, 'wizardHeadersPrompt'),
    placeHolder: t(language, 'wizardHeadersPlaceholder'),
    value: currentHeaders || '{}',
    validateInput: value => validateHeaders(language, value)
  });
  if (extraHeaders === undefined) {
    return false;
  }

  await updateSetting('extraHeaders', extraHeaders.trim() || '{}');

  const clipboardPick = await vscode.window.showQuickPick(
    [
      { label: t(language, 'wizardClipboardYes'), value: true },
      { label: t(language, 'wizardClipboardNo'), value: false }
    ],
    {
      placeHolder: t(language, 'wizardClipboardPlaceholder'),
      ignoreFocusOut: true
    }
  );
  if (!clipboardPick) {
    return false;
  }

  await updateSetting('copyToClipboard', clipboardPick.value);

  return true;
}

function validateHeaders(language: UiLanguage, value: string): string | undefined {
  const text = value.trim();
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return t(language, 'wizardHeadersInvalid');
    }
  } catch {
    return t(language, 'wizardHeadersInvalid');
  }

  return undefined;
}

async function pickLanguage(currentLanguage: UiLanguage): Promise<UiLanguage | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: '中文', description: '简体中文', value: 'zh' as const },
      { label: 'English', description: 'English', value: 'en' as const }
    ],
    {
      placeHolder: currentLanguage === 'zh' ? '第 1 步：选择语言' : 'Step 1: Select language',
      ignoreFocusOut: true
    }
  );

  return picked?.value;
}

async function pickProvider(language: UiLanguage, currentProvider: Provider): Promise<Provider | undefined> {
  const picked = await vscode.window.showQuickPick(
    PROVIDERS.map(provider => ({
      label: providerLabel(language, provider),
      description: getDefaultModel(provider),
      detail: provider === currentProvider ? (language === 'zh' ? '当前' : 'Current') : '',
      value: provider
    })),
    {
      placeHolder: t(language, 'wizardProviderPlaceholder'),
      ignoreFocusOut: true
    }
  );

  return picked?.value;
}

async function updateSetting(key: string, value: unknown): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await vscode.workspace.getConfiguration(CONFIG_ROOT).update(key, value, target);
}

function normalizeRequestPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

async function pickModel(
  language: UiLanguage,
  provider: Provider,
  currentProvider: Provider,
  currentModel: string
): Promise<string | undefined> {
  const defaultModel = getDefaultModel(provider);
  const initialModel = provider === currentProvider && currentModel ? currentModel : defaultModel;
  const suggestedModels = getSuggestedModels(provider);

  // If we don't have suggestions (e.g. custom provider), fallback to free-form input.
  if (suggestedModels.length === 0) {
    const value = await vscode.window.showInputBox({
      prompt: t(language, 'wizardModelPrompt'),
      placeHolder: t(language, 'wizardModelPlaceholder'),
      value: initialModel,
      validateInput: input => (input.trim() ? undefined : t(language, 'wizardModelPrompt'))
    });

    return value === undefined ? undefined : value.trim();
  }

  const latestHint = language === 'zh' ? '默认(最新)' : 'Default (latest)';
  const customLabel = language === 'zh' ? '自定义输入…' : 'Custom input…';
  const customDetail = language === 'zh' ? '手动输入任意模型名' : 'Type any model name';

  const items: vscode.QuickPickItem[] = [
    ...suggestedModels.map(model => ({
      label: model,
      description: model === defaultModel ? latestHint : ''
    })),
    { label: customLabel, detail: customDetail }
  ];

  const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
  quickPick.items = items;
  quickPick.ignoreFocusOut = true;
  quickPick.matchOnDescription = true;
  quickPick.placeholder = t(language, 'wizardModelPlaceholder');
  quickPick.value = initialModel;

  const initialItem =
    items.find(item => item.label === initialModel) ?? items.find(item => item.label === defaultModel);
  if (initialItem) {
    quickPick.activeItems = [initialItem];
  }

  return await new Promise(resolve => {
    let settled = false;

    const finish = (value: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      quickPick.dispose();
      resolve(value);
    };

    const accept = async () => {
      const picked = quickPick.selectedItems[0] ?? quickPick.activeItems[0];

      if (picked?.label === customLabel) {
        quickPick.hide();
        const value = await vscode.window.showInputBox({
          prompt: t(language, 'wizardModelPrompt'),
          placeHolder: t(language, 'wizardModelPlaceholder'),
          value: initialModel,
          validateInput: input => (input.trim() ? undefined : t(language, 'wizardModelPrompt'))
        });
        finish(value === undefined ? undefined : value.trim());
        return;
      }

      if (picked?.label) {
        quickPick.hide();
        finish(picked.label.trim());
        return;
      }

      const typed = quickPick.value.trim();
      if (typed) {
        quickPick.hide();
        finish(typed);
        return;
      }

      void vscode.window.showErrorMessage(
        language === 'zh' ? '模型名称不能为空。' : 'Model name cannot be empty.'
      );
    };

    const hide = () => finish(undefined);

    quickPick.onDidAccept(() => {
      void accept();
    });
    quickPick.onDidHide(hide);

    quickPick.show();
  });
}
