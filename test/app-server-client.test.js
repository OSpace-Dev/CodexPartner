const test = require("node:test");
const assert = require("node:assert/strict");
const { AppServerClient } = require("../src/app-server-client");

test("AppServerClient correlates responses and forwards notifications", async () => {
  const fakeServer = [
    "process.stdin.setEncoding('utf8');",
    "let buffer = '';",
    "process.stdin.on('data', chunk => {",
    "  buffer += chunk;",
    "  let index = buffer.indexOf('\\n');",
    "  while (index >= 0) {",
    "    const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);",
    "    if (message.method === 'initialize') process.stdout.write(JSON.stringify({id: message.id, result: {ok: true}}) + '\\n');",
    "    if (message.method === 'thread/list') process.stdout.write(JSON.stringify({id: message.id, result: {data: [{id: 'thread-1'}]}}) + '\\n');",
    "    if (message.method === 'turn/start') {",
    "      process.stdout.write(JSON.stringify({id: message.id, result: {turn: {id: 'turn-1'}}}) + '\\n');",
    "      process.stdout.write(JSON.stringify({method: 'item/agentMessage/delta', params: {threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'ok'}}) + '\\n');",
    "    }",
    "    index = buffer.indexOf('\\n');",
    "  }",
    "});",
  ].join("\n");

  const client = new AppServerClient({
    command: process.execPath,
    args: ["-e", fakeServer],
    cwd: process.cwd(),
    timeoutMs: 2_000,
  });
  const deltas = [];
  client.on("item/agentMessage/delta", (params) => deltas.push(params.delta));

  try {
    await client.start();
    const list = await client.request("thread/list", { limit: 1 });
    const turn = await client.request("turn/start", {
      threadId: "thread-1",
      input: [{ type: "text", text: "hello" }],
    });

    assert.equal(list.data[0].id, "thread-1");
    assert.equal(turn.turn.id, "turn-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(deltas.join("|"), "ok");
  } finally {
    await client.stop();
  }
});

test("AppServerClient cleans a request when stdin cannot be written", async () => {
  const client = new AppServerClient({ command: process.execPath });
  client.process = { stdin: { writable: false } };

  await assert.rejects(client.request("thread/list", {}), /input is not writable/);
  assert.equal(client.pending.size, 0);
});

test("AppServerClient stops and clears the process when initialization fails", async () => {
  const fakeServer = [
    "setTimeout(() => process.exit(3), 20);",
  ].join("\n");
  const client = new AppServerClient({
    command: process.execPath,
    args: ["-e", fakeServer],
    cwd: process.cwd(),
    timeoutMs: 1_000,
  });
  client.on("error", () => {});

  await assert.rejects(client.start(), /exited|Timed out/);
  assert.equal(client.process, null);
  assert.equal(client.pending.size, 0);
});
