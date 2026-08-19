import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as acp from '@agentclientprotocol/sdk';

const adapterPath = fileURLToPath(new URL('../node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js', import.meta.url));

export class AcpSession {
  constructor({ cwd, emit }) {
    this.cwd = cwd;
    this.emit = emit;
    this.pendingPermissions = new Map();
    this.ready = this.connect();
  }

  async connect() {
    this.process = spawn(process.execPath, [adapterPath], {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process.stderr.on('data', chunk => {
      const message = chunk.toString();
      console.error(`[claude-agent-acp] ${message.trimEnd()}`);
      this.emit({ type: 'log', level: 'debug', message });
    });
    this.process.on('exit', (code, signal) => this.emit({ type: 'status', status: 'offline', detail: `ACP 进程已退出 (${code ?? signal})` }));

    const stream = acp.ndJsonStream(Writable.toWeb(this.process.stdin), Readable.toWeb(this.process.stdout));
    const client = {
      sessionUpdate: params => this.emit({ type: 'update', sessionId: params.sessionId, update: params.update }),
      requestPermission: params => this.requestPermission(params),
    };
    this.connection = new acp.ClientSideConnection(() => client, stream);
    const initialized = await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: 'ruankao-mobile-web', title: '软考架构师移动端', version: '0.1.0' },
      clientCapabilities: { _meta: { 'subagent-transcript': true } },
    });
    const created = await this.connection.newSession({ cwd: this.cwd, mcpServers: [] });
    this.sessionId = created.sessionId;
    if (created.modes?.availableModes?.some(mode => mode.id === 'default') && created.modes.currentModeId !== 'default') {
      await this.connection.setSessionMode({ sessionId: this.sessionId, modeId: 'default' });
      created.modes.currentModeId = 'default';
    }
    this.emit({ type: 'ready', sessionId: this.sessionId, capabilities: initialized.agentCapabilities, modes: created.modes, configOptions: created.configOptions });
  }

  requestPermission(params) {
    const requestId = randomUUID();
    this.emit({ type: 'permission', requestId, request: params });
    return new Promise(resolve => this.pendingPermissions.set(requestId, resolve));
  }

  resolvePermission(requestId, optionId) {
    const resolve = this.pendingPermissions.get(requestId);
    if (!resolve) return false;
    this.pendingPermissions.delete(requestId);
    resolve(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } });
    return true;
  }

  async prompt({ text, image }) {
    await this.ready;
    const blocks = [];
    if (image) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) throw new Error('图片格式无效');
      blocks.push({ type: 'image', mimeType: match[1], data: match[2] });
    }
    if (text) blocks.push({ type: 'text', text });
    this.emit({ type: 'turn', status: 'running' });
    try {
      const response = await this.connection.prompt({ sessionId: this.sessionId, prompt: blocks });
      this.emit({ type: 'turn', status: 'done', stopReason: response.stopReason });
    } catch (error) {
      this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      this.emit({ type: 'turn', status: 'done', stopReason: 'error' });
    }
  }

  async cancel() {
    await this.ready;
    await this.connection.cancel({ sessionId: this.sessionId });
  }

  close() {
    for (const resolve of this.pendingPermissions.values()) resolve({ outcome: { outcome: 'cancelled' } });
    this.pendingPermissions.clear();
    this.process?.kill('SIGTERM');
  }
}
