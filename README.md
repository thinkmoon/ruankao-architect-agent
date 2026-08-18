# 软考高级·系统架构设计师 Agent

这是一个供个人长期使用的 Claude Code 备考工作区，目标为 2026 年下半年系统架构设计师考试。

## 已具备的行为

- 进入目录后自动加载软考架构师助手身份
- 按需安排学习，不主动打扰
- 用本地 Markdown/JSON 跨会话记录进度、错题与作答
- 联网核验最新考务、考纲和资料，保留来源
- 默认优先可核验真题；用户明确要求时才生成模拟题
- 先作答后解析，默认严格按真实考试标准评分
- 为案例分析和论文训练保留独立档案

## 使用 Claude Code

```bash
cd /home/liqinsi/Documents/project/ruankao-architect-agent
claude
```

进入后可以直接说：

- `介绍一下你会怎么辅助我，不要启动正式备考`
- `开始备考`
- `今晚我有 90 分钟，开始学习`
- `给我一道可核验来源的真题`
- `查看当前进度`

## 通过 HAPI 使用

HAPI 对 Claude Code 使用原生 TUI/Agent SDK 集成，不需要 ACP 适配器。先在一个终端启动 Hub：

```bash
hapi hub --relay
```

再在另一个终端启动本项目的 Claude 会话：

```bash
cd /home/liqinsi/Documents/project/ruankao-architect-agent
hapi claude
```

`hapi` 是 `hapi claude` 的简写。扫描终端二维码，在手机或网页中访问。务必从本项目目录创建会话，才能自动加载本项目配置。若将来换机器且尚未全局安装 HAPI，可把命令替换成 `npx @twsxtd/hapi ...`。

## 状态边界

Agent 当前处于 `setup` 阶段，没有伪造学习进度。用户明确说“开始备考”或“开始学习”后，才会建立正式计划和记录。

运行本地结构校验：

```bash
./scripts/validate.sh
```
