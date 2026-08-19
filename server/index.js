import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { AcpSession } from './acp-session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const server = createServer(app);
const accessToken = process.env.ACP_ACCESS_TOKEN || randomBytes(24).toString('base64url');
const tokenMatches = candidate => {
  if (!candidate) return false;
  const actual = Buffer.from(candidate); const expected = Buffer.from(accessToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const wss = new WebSocketServer({
  server,
  path: '/ws/acp',
  maxPayload: 12 * 1024 * 1024,
  verifyClient: ({ req }) => tokenMatches(new URL(req.url, 'http://localhost').searchParams.get('token')),
});

if (process.env.NODE_ENV === 'development') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*splat', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

wss.on('connection', socket => {
  const send = payload => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const acpSession = new AcpSession({ cwd: root, emit: send });
  send({ type: 'status', status: 'connecting', detail: '正在连接 Claude Code…' });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'prompt') void acpSession.prompt({ text: message.text, image: message.image });
      else if (message.type === 'permission_response') acpSession.resolvePermission(message.requestId, message.optionId);
      else if (message.type === 'cancel') void acpSession.cancel();
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  socket.on('close', () => acpSession.close());
});

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`软考助手已启动：http://localhost:${port}/?token=${accessToken}`);
  console.log('访问令牌仅用于本次启动，请勿把链接转发给他人。');
});
