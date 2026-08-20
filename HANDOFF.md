# 交接文档：前端后端数据打通

## 项目背景

软考高级系统架构设计师备考工具。用户是近十年经验的资深开发者，目标通过 2026 年下半年考试。

项目根目录：`/home/liqinsi/Documents/project/ruankao-architect-agent/`

## 当前问题

前端（React Web App）和后端（本地 JSON 状态文件 + 真题 Markdown）完全隔离：
- 前端 `questions` 数组是 4 道硬编码样例题，不是真实真题
- 进度/错题存 `localStorage`，不写入后端 JSON
- 知识画像（`mastery`、`trend`）是写死的假数据
- 首页展示"连续学习6天/完成18题/正确率76%"都是假数据

## 需要实现的后端 API

在 `server/index.js` 中（Express + Node.js ESM）添加以下 REST 端点：

### 1. `GET /api/questions`

从 `zhenti/` 目录解析真题 Markdown 文件，返回综合知识单选题列表。

参数（query string）：
- `year`：如 `2024下`、`2025上`（默认 `2024下`）
- `page`、`pageSize`：分页（默认第1页，每页20题）

返回格式：
```json
{
  "year": "2024下",
  "total": 75,
  "page": 1,
  "pageSize": 20,
  "questions": [
    {
      "id": "2024下-001",
      "num": 1,
      "source": "2024 下半年 · 综合知识",
      "title": "一项外观设计专利里面相似设计最多有（ ）个。",
      "options": ["10", "6", "8", "5"],
      "answer": 0,
      "topic": "",
      "difficulty": ""
    }
  ]
}
```

#### Markdown 解析规则（`zhenti/2024下/综合知识.md` 格式）

每题结构：
```
## 第N题

题干文字

- **A.** 选项文字
- **B.** 选项文字
- **C.** 选项文字
- **D.** 选项文字

**正确答案：X**
```

注意事项：
- 第 6-10 题是阅读理解，题干在第6题里，7-10题只有"第N题选项"然后直接列选项
- answer 字段用 0-indexed 整数（A=0, B=1, C=2, D=3）
- 题目间用 `---` 分隔

### 2. `GET /api/state`

读取并返回后端状态汇总：
```json
{
  "progress": { ...state/progress.json 内容 },
  "mistakes": { ...state/mistakes.json 内容 },
  "attempts": { ...state/attempts.json 内容 }
}
```

### 3. `POST /api/attempts`

记录一次答题，写入 `state/attempts.json` 和更新 `state/progress.json`。

请求体：
```json
{
  "questionId": "2024下-003",
  "year": "2024下",
  "source": "2024 下半年 · 综合知识",
  "selected": 0,
  "correct": true,
  "topic": "计算机网络",
  "answeredAt": "2026-08-19T18:30:00+08:00"
}
```

写入 `state/attempts.json`：
```json
{
  "schema_version": 1,
  "items": [
    {
      "id": "uuid",
      "questionId": "...",
      "year": "...",
      "source": "...",
      "selected": 0,
      "correct": true,
      "topic": "...",
      "answeredAt": "..."
    }
  ]
}
```

同步更新 `state/progress.json`：
- `attempted_questions` +1
- `last_study_date` 设为今天（Asia/Shanghai，YYYY-MM-DD）
- `scores.comprehensive` 追加本次正确率（按会话窗口：每次 POST 后重新计算最近 20 题正确率）

### 4. `POST /api/mistakes`

更新 `state/mistakes.json` 中的错题列表。

请求体：
```json
{ "questionId": "2024下-003", "action": "add" }
```
或
```json
{ "questionId": "2024下-003", "action": "remove" }
```

`state/mistakes.json` 格式：
```json
{
  "schema_version": 1,
  "items": [
    {
      "questionId": "2024下-003",
      "addedAt": "2026-08-19"
    }
  ]
}
```

### 5. `GET /api/stats`

返回首页统计数据，完全从后端 JSON 计算：
```json
{
  "totalDone": 42,
  "mistakeCount": 7,
  "recentAccuracy": 0.76,
  "studyDays": 3,
  "trend": [
    { "d": "8/17", "v": 70 },
    { "d": "8/18", "v": 75 },
    { "d": "今天", "v": 80 }
  ],
  "masteryByTopic": [
    { "subject": "软件架构设计", "value": 72 }
  ]
}
```

`trend` 从 `attempts.json` 按天聚合计算正确率（最近7天）。
`masteryByTopic` 从 `attempts.json` 按 `topic` 分组计算正确率，乘以100取整。

## 前端修改点（`src/main.jsx`）

替换所有硬编码数据，改用 API：

1. **删除** `questions` / `mastery` / `trend` 三个硬编码常量

2. **`PracticePage`**：
   - 组件挂载时 `fetch('/api/questions?year=2024下')` 获取题目
   - 加 loading 状态
   - 提交答案后 `POST /api/attempts` 记录
   - 收藏/取消收藏时 `POST /api/mistakes`
   - **不再用 `useStored('rk_wrong', ...)` 和 `useStored('rk_done', ...)`**，改用后端

3. **`HomePage`**：
   - 挂载时 `fetch('/api/stats')` 获取真实统计
   - 替换假的"连续6天/完成18题/正确率76%"

4. **`InsightsPage`**：
   - 挂载时 `fetch('/api/stats')` 获取 `trend` 和 `masteryByTopic`

5. **`MistakesPage`**：
   - 挂载时 `fetch('/api/state')` 获取错题 ID 列表
   - 显示错题时从 questions 列表中匹配（或单独加 `/api/questions?ids=...`）

## 文件路径说明

```
项目根/
├── server/
│   ├── index.js          ← 加 API 路由
│   ├── zhenti-parser.js  ← 新建，解析 Markdown 真题
│   └── acp-session.js    ← 不动
├── src/
│   └── main.jsx          ← 改前端接 API
├── state/
│   ├── progress.json     ← API 会读写
│   ├── attempts.json     ← API 会读写
│   └── mistakes.json     ← API 会读写
└── zhenti/
    ├── 2024下/综合知识.md  ← 解析来源
    ├── 2025上/综合知识.md
    └── ...
```

## 当前 server/index.js 结构

ESM，用 Express 5 + ws。现有路由只有 SPA fallback 和 WebSocket `/ws/acp`。
加 API 路由前要加 `express.json()` middleware。
文件读写用 `node:fs/promises`，路径从 `root`（项目根）拼接。

## 注意

- `state/` 文件读写要处理并发（简单方案：单个文件同时只有一个写操作，用 async/await 串行即可，不需要锁）
- JSON 写入后必须保持合法 JSON
- 日期用 `YYYY-MM-DD`，时区语义 Asia/Shanghai
- `progress.json` 的 `phase` 字段不要改动（保持 `setup` 或当前值）
