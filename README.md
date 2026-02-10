# AutoGit LLM

A lightweight VS Code extension that generates git commit messages from repository changes and places the message into the Source Control input box.

## Features

- Adds **AI: Generate Commit Message** button to the Git Source Control title bar.
- Generates a commit message from staged/unstaged changes.
- Supports multiple providers:
  - OpenAI
  - DeepSeek
  - Gemini
  - Kimi (Moonshot)
  - GLM (Zhipu)
  - Custom OpenAI-compatible providers (third-party gateways and base URLs)
- Configurable generation rules with a practical default template.
- Compatibility layer for third-party AI vendors:
  - custom base URL
  - custom OpenAI-compatible request path
  - optional extra headers (JSON)
- Performance-focused defaults:
  - bounded git diff size (`maxDiffBytes`)
  - command and request timeouts
  - no background polling

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile:

   ```bash
   npm run compile
   ```

3. Press `F5` in VS Code to launch the Extension Development Host.

## Usage

1. Open a git repository in VS Code.
2. Make changes (staged or unstaged).
3. In Source Control view, click **AI: Generate Commit Message**.
4. The generated message is placed into the SCM input box.

## Key Settings

- `autogitllm.provider`: `openai | deepseek | gemini | kimi | glm | custom`
- `autogitllm.model`: model name (empty = provider default)
- `autogitllm.apiKey`: provider API key
- `autogitllm.baseUrl`: optional custom base URL
- `autogitllm.customRequestPath`: custom OpenAI-compatible path (default `/chat/completions`)
- `autogitllm.extraHeaders`: JSON map for additional request headers
- `autogitllm.includeOnlyStaged`: include only staged changes
- `autogitllm.maxDiffBytes`: diff byte budget for prompt payload
- `autogitllm.ruleTemplate`: main rule template
- `autogitllm.additionalRules`: extra custom rules appended to prompt
- `autogitllm.copyToClipboard`: copy generated message to clipboard

## Environment Variables

If `autogitllm.apiKey` is empty, the extension checks:

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `MOONSHOT_API_KEY`
- `ZHIPU_API_KEY`
- `AUTOGITLLM_API_KEY`

## Notes

- For `custom`, set `autogitllm.baseUrl` and a compatible `autogitllm.model`.
- Gemini uses native `generateContent` API.
- Other providers use OpenAI-compatible chat completions.
- For very large repositories, increase `maxDiffBytes` cautiously to control latency/cost.
