#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const timeoutMs = Number(args["timeout-ms"] ?? 15_000);
const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
const codexCommand = args.codex ?? process.env.CODEX_CLI_PATH ?? "codex";

const server = spawn(codexCommand, ["app-server", "--listen", "stdio://"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let nextRequestId = 1;
let stdoutBuffer = "";
let stderrBuffer = "";
const pending = new Map();

server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", (chunk) => consumeStdout(chunk));
server.stderr.on("data", (chunk) => {
  stderrBuffer = `${stderrBuffer}${chunk}`.slice(-8_000);
});
server.on("error", (error) => rejectPending(error));
server.on("exit", (code, signal) => {
  const detail = `Codex app-server exited before completing the probe (code=${code}, signal=${signal}).`;
  rejectPending(new Error(detail));
});

try {
  await request("initialize", {
    clientInfo: {
      name: "codex_partner_probe",
      title: "Codex Partner Probe",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true },
  });
  console.log("PASS initialize");

  const accountResult = await request("account/read", {});
  printAccount(accountResult);

  const threadResult = await request("thread/list", {
    limit,
    sortKey: "updated_at",
  });
  const threads = getThreadList(threadResult);
  console.log(`PASS thread/list (${threads.length} thread(s) visible)`);
  for (const thread of threads.slice(0, 10)) {
    console.log(formatThread(thread));
  }

  const selectedThreadId = args["thread-id"] ?? threads[0]?.id;
  if (selectedThreadId) {
    const readResult = await request("thread/read", {
      threadId: selectedThreadId,
      includeTurns: true,
    });
    printThreadRead(readResult, selectedThreadId);
  } else {
    console.log("SKIP thread/read (no visible thread id)");
  }

  console.log("Probe completed without starting a turn or changing a conversation.");
  server.kill();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  if (stderrBuffer.trim()) {
    console.error("-- app-server stderr --");
    console.error(stderrBuffer.trim());
  }
  server.kill();
  process.exitCode = 1;
}

function request(method, params) {
  const id = nextRequestId++;
  const message = `${JSON.stringify({ id, method, params })}\n`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method} response.`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    server.stdin.write(message);
  });
}

function consumeStdout(chunk) {
  stdoutBuffer = `${stdoutBuffer}${chunk}`;
  let newlineIndex = stdoutBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    if (line) {
      handleMessage(JSON.parse(line));
    }
    newlineIndex = stdoutBuffer.indexOf("\n");
  }
}

function handleMessage(message) {
  if (message.id === undefined) return;
  const requestState = pending.get(message.id);
  if (!requestState) return;
  pending.delete(message.id);
  clearTimeout(requestState.timer);
  if (message.error) {
    requestState.reject(new Error(`${requestState.method}: ${formatError(message.error)}`));
    return;
  }
  requestState.resolve(message.result);
}

function rejectPending(error) {
  for (const requestState of pending.values()) {
    clearTimeout(requestState.timer);
    requestState.reject(error);
  }
  pending.clear();
}

function getThreadList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.threads)) return result.threads;
  return [];
}

function printAccount(result) {
  const account = result?.account ?? result ?? {};
  const type = account.type ?? account.authMode ?? account.auth_mode ?? "unknown";
  const email = account.email ?? account.emailAddress ?? "not exposed";
  const plan = account.planType ?? account.plan_type ?? "not exposed";
  console.log(`PASS account/read (auth=${type}, email=${email}, plan=${plan})`);
}

function formatThread(thread) {
  const id = thread.id ?? thread.threadId ?? "unknown";
  const title = thread.name ?? thread.title ?? "(untitled)";
  const updated = thread.updatedAt ?? thread.updated_at ?? "unknown";
  return `  thread ${id} | ${title} | updated=${updated}`;
}

function printThreadRead(result, requestedId) {
  const thread = result?.thread ?? result ?? {};
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const items = turns.flatMap((turn) => (Array.isArray(turn.items) ? turn.items : []));
  const types = [...new Set(items.map((item) => item.type).filter(Boolean))];
  console.log(
    `PASS thread/read (${thread.id ?? requestedId}, turns=${turns.length}, items=${items.length}, types=${types.join(",") || "none"})`,
  );
}

function formatError(error) {
  if (typeof error === "string") return error;
  return error?.message ?? JSON.stringify(error);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}
