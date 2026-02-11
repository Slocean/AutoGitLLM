# GitFathom

一款用于生成高质量 Git 提交信息的 VS Code 扩展，支持多厂商模型与可视化配置，生成结果会自动写入 Source Control 输入框。

[English](#english)

## 功能特性

- Git 面板一键生成提交信息（图标按钮）
- 命令面板配置向导（Ctrl+Shift+P）
- 支持 OpenAI / DeepSeek / Gemini / Kimi / GLM / 自定义兼容厂商
- 支持自定义 Base URL、请求路径、额外请求头
- 中英双语 UI 与提交信息输出
- 性能友好：限制 diff 大小、控制超时、无后台轮询

## 安装与调试

1. 安装依赖

   ```bash
   npm install
   ```

2. 编译

   ```bash
   npm run compile
   ```

3. 按 `F5` 启动扩展开发宿主

## 快速开始

1. 按 `Ctrl+Shift+P`，运行 `GitFathom: Open Setup Wizard`
2. 选择语言、厂商与模型
3. 配置 API Key / Base URL / Headers
4. 打开任意 Git 仓库，在 Git 面板点击图标按钮生成提交信息

## 常用设置

- `gitgathom.language`: `zh | en`
- `gitgathom.provider`: `openai | deepseek | gemini | kimi | glm | custom`
- `gitgathom.model`
- `gitgathom.apiKey`
- `gitgathom.baseUrl`
- `gitgathom.customRequestPath`
- `gitgathom.extraHeaders`
- `gitgathom.ruleTemplate`
- `gitgathom.additionalRules`
- `gitgathom.copyToClipboard`

## 环境变量

当 `gitgathom.apiKey` 为空时，会尝试读取：

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `MOONSHOT_API_KEY`
- `ZHIPU_API_KEY`
- `GITFATHOM_API_KEY`

---

## English

GitFathom is a VS Code extension that generates high-quality Git commit messages and writes them into the Source Control input box.

## Features

- One-click commit message generation in Git panel (icon button)
- Setup wizard via Command Palette (Ctrl+Shift+P)
- Providers: OpenAI / DeepSeek / Gemini / Kimi / GLM / Custom OpenAI-compatible
- Custom Base URL, request path, and extra headers
- Bilingual UI and output (zh/en)
- Performance-friendly defaults: bounded diff size, timeouts, no background polling

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Compile

   ```bash
   npm run compile
   ```

3. Press `F5` to launch the Extension Development Host

## Quick Start

1. Press `Ctrl+Shift+P`, run `GitFathom: Open Setup Wizard`
2. Select language, provider, and model
3. Configure API key / Base URL / headers
4. Open any Git repo and click the icon button in the Git panel

## Settings

- `gitgathom.language`: `zh | en`
- `gitgathom.provider`: `openai | deepseek | gemini | kimi | glm | custom`
- `gitgathom.model`
- `gitgathom.apiKey`
- `gitgathom.baseUrl`
- `gitgathom.customRequestPath`
- `gitgathom.extraHeaders`
- `gitgathom.ruleTemplate`
- `gitgathom.additionalRules`
- `gitgathom.copyToClipboard`

## Environment Variables

If `gitgathom.apiKey` is empty, GitFathom will check:

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `MOONSHOT_API_KEY`
- `ZHIPU_API_KEY`
- `GITFATHOM_API_KEY`
