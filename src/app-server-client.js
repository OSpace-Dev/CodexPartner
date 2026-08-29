const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

class AppServerClient extends EventEmitter {
  constructor({ command, args, cwd, env = process.env, timeoutMs = 20_000, log }) {
    super();
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.log = log ?? (() => {});
    this.process = null;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.closed = false;
  }

  async start() {
    if (this.process) return;
    this.closed = false;

    const spawnArgs = this.args ?? ["app-server", "--listen", "stdio://"];
    const childProcess = spawn(this.command, spawnArgs, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = childProcess;

    const lineReader = readline.createInterface({ input: childProcess.stdout });
    lineReader.on("line", (line) => this.handleLine(line));
    childProcess.stderr.setEncoding("utf8");
    childProcess.stderr.on("data", (chunk) => {
      this.log(String(chunk).trim());
    });
    childProcess.on("error", (error) => this.fail(error));
    childProcess.on("exit", (code, signal) => {
      if (this.process === childProcess) this.process = null;
      const error = new Error(`Codex app-server exited (code=${code}, signal=${signal}).`);
      this.fail(error);
      this.emit("exit", { code, signal });
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "codex_partner",
          title: "Codex Partner",
          version: "0.1.0",
        },
        capabilities: { experimentalApi: true },
      });
      this.notify("initialized", {});
      this.emit("ready");
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  request(method, params) {
    if (!this.process || this.closed) {
      return Promise.reject(new Error("Codex app-server is not running."));
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.write({ method, params });
  }

  async stop() {
    this.closed = true;
    this.fail(new Error("Codex app-server stopped."));
    if (!this.process) return;
    this.process.stdin.end();
    const processToStop = this.process;
    this.process = null;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        processToStop.kill();
        resolve();
      }, 1_000);
      processToStop.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  write(message) {
    if (!this.process?.stdin.writable) {
      throw new Error("Codex app-server input is not writable.");
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  handleLine(line) {
    const trimmed = String(line).trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      this.emit("protocolError", new Error(`Invalid app-server JSON: ${error.message}`));
      return;
    }

    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message);
      return;
    }
    if (message.id !== undefined) {
      this.handleResponse(message);
      return;
    }
    if (message.method) {
      this.emit("notification", message);
      this.emit(message.method, message.params ?? {});
    }
  }

  handleResponse(message) {
    const requestState = this.pending.get(message.id);
    if (!requestState) return;
    this.pending.delete(message.id);
    clearTimeout(requestState.timer);
    if (message.error) {
      requestState.reject(new Error(`${requestState.method}: ${formatError(message.error)}`));
      return;
    }
    requestState.resolve(message.result);
  }

  handleServerRequest(message) {
    this.emit("serverRequest", message);
    const method = String(message.method);
    let result = {};
    if (method.includes("requestApproval")) {
      result = { decision: "decline" };
    } else if (method.includes("requestUserInput")) {
      result = { answers: {} };
    }
    try {
      this.write({ id: message.id, result });
    } catch (error) {
      this.emit("protocolError", error);
    }
  }

  fail(error) {
    for (const state of this.pending.values()) {
      clearTimeout(state.timer);
      state.reject(error);
    }
    this.pending.clear();
    if (!this.closed) this.emit("error", error);
  }
}

function resolveCodexExecutable(vscode, configuration) {
  const configuredPath = configuration.get("codexCliPath");
  if (configuredPath) return configuredPath;
  if (process.env.CODEX_CLI_PATH) return process.env.CODEX_CLI_PATH;

  const officialExtensionPath = vscode.extensions.getExtension("openai.chatgpt")?.extensionPath;
  const fromOfficialExtension = executableFromExtensionPath(officialExtensionPath);
  if (fromOfficialExtension) return fromOfficialExtension;

  for (const extensionsRoot of extensionRoots()) {
    const discovered = discoverOfficialExtensionExecutable(extensionsRoot);
    if (discovered) return discovered;
  }
  return process.platform === "win32" ? "codex.exe" : "codex";
}

function extensionRoots() {
  const home = os.homedir();
  const roots = [path.join(home, ".vscode", "extensions")];
  if (process.platform === "win32") roots.push(path.join(home, ".vscode-insiders", "extensions"));
  return roots;
}

function discoverOfficialExtensionExecutable(root) {
  if (!root || !fs.existsSync(root)) return null;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-"))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
  for (const entry of candidates) {
    const executable = executableFromExtensionPath(path.join(root, entry.name));
    if (executable) return executable;
  }
  return null;
}

function executableFromExtensionPath(extensionPath) {
  if (!extensionPath) return null;
  const platformDirectory = process.platform === "win32"
    ? "windows-x86_64"
    : process.platform === "darwin"
      ? "macos-universal"
      : "linux-x86_64";
  const executableName = process.platform === "win32" ? "codex.exe" : "codex";
  const candidate = path.join(extensionPath, "bin", platformDirectory, executableName);
  return fs.existsSync(candidate) ? candidate : null;
}

function formatError(error) {
  if (typeof error === "string") return error;
  return error?.message ?? JSON.stringify(error);
}

module.exports = {
  AppServerClient,
  resolveCodexExecutable,
};
