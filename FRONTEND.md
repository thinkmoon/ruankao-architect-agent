# 移动端 Web 前端

## 启动

```bash
npm install
npm run dev
```

生产构建使用 `npm run build`，产物位于 `dist/`。

启动后终端会输出带一次性访问令牌的 URL，手机必须使用完整链接访问。也可以通过 `ACP_ACCESS_TOKEN` 固定令牌，通过 `PORT`、`HOST` 修改监听地址。

## Claude Code ACP

`npm run dev` 同时启动 Web 服务与 ACP Client。浏览器通过 `/ws/acp` 连接 Node 服务；服务为连接启动 `@agentclientprotocol/claude-agent-acp`，并以项目根目录创建 Claude Code 会话。

启动前需要确保本机 Claude Code 已登录：

```bash
claude auth status
```

消息链路为：浏览器 WebSocket → Node ACP Client → stdio JSON-RPC → Claude Agent ACP。支持流式回答、图片、工具调用、权限确认和取消当前生成。

ACP 会话具有本机文件和工具权限。服务默认监听所有网络接口以便手机访问，但 WebSocket 强制校验访问令牌；不要公开分享带 token 的链接，也不要未经 HTTPS 反向代理直接暴露到公网。

## 当前数据策略

- 综合知识题从本地 `zhenti/` Markdown 解析，答题与错题通过服务端 API 保存。
- 「真题练习」提供综合知识与案例分析切换。案例草稿按题保存在浏览器，已提交答案与批改保存在 `state/case-attempts.json`。
- 案例分析按小问提交、当场批改；未提交的小问不返回参考答案。AI 批改为非官方估算评分，失败可重试。历史作答支持回看与继续批改。
- 「知识画像」和知识地图是同一棵树：顶层就是考点分类，掌握度按最近一次作答。图谱文件 `state/knowledge-graph.json` schema 2，旧领域已重建。解析只往标准领域下挂概念。
- 图片转换为 ACP `ImageContent` 后直接发送给 Claude Code，单张限制 8 MB。
