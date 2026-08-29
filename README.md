# Codex Partner

Codex Partner is a minimal VS Code extension prototype that talks to the local Codex App Server over stdio JSONL.

## Current scope

- Lists visible Codex threads.
- Reads the selected thread history.
- Creates a new durable thread when requested.
- Sends text with `turn/start`.
- Renders streamed `item/agentMessage/delta` feedback.
- Adds a selected editor range to the chat as a workspace-relative file and line reference.

The extension does not read VS Code cookies, desktop-app storage, or private login tokens. It delegates authentication and account access to the local Codex CLI process.

## Run in VS Code

1. Open this folder in VS Code.
2. Press `F5` and choose `Run Codex Partner` to launch an Extension Development Host. The development extension is loaded in the new window, not in the original window.
3. In the new window, open the `Codex Partner` activity bar view.
4. Select a conversation or create a new one, then send a message.
5. In any saved-file editor, select text and click the lightbulb or press `Ctrl+.`; choose `添加到 Codex Partner 对话`. The reference is inserted at the current composer cursor position. The right-click command remains available as a fallback.

Closing VS Code also closes the Extension Development Host. The next time, reopen the project folder and press `F5` again; opening the project in a normal VS Code window alone does not install or activate this working-copy extension.

## Codex executable resolution

The extension checks, in order:

1. `codexPartner.codexCliPath`.
2. `CODEX_CLI_PATH`.
3. The active official `openai.chatgpt` extension's bundled executable.
4. An installed official extension under the normal VS Code extensions directory.
5. `codex.exe` or `codex` on `PATH`.

## Verification

Run `npm run check` for JavaScript syntax checks. Run `npm run probe` for the read-only App Server probe; pass `--codex <path>` when Codex is not on `PATH`.
