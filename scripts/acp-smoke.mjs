import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as acp from '@agentclientprotocol/sdk';

const adapter = fileURLToPath(new URL('../node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js', import.meta.url));
const child = spawn(process.execPath, [adapter], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'inherit'] });
const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
const connection = new acp.ClientSideConnection(() => ({
  requestPermission(params) {
    const allow = params.options.find(option => option.kind === 'allow_once') || params.options[0];
    return { outcome: { outcome: 'selected', optionId: allow.optionId } };
  },
  sessionUpdate(params) {
    if (params.update.sessionUpdate === 'agent_message_chunk' && params.update.content?.type === 'text') process.stdout.write(params.update.content.text);
  },
}), stream);

try {
  await connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} });
  const session = await connection.newSession({ cwd: process.cwd(), mcpServers: [] });
  const result = await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: '只回复：ACP_SMOKE_OK' }] });
  process.stdout.write(`\nstopReason=${result.stopReason}\n`);
} finally {
  child.kill('SIGTERM');
}
