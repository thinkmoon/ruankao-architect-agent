---
name: study-session
description: This skill should be used when the user asks “开始学习”, “继续学习”, “今天学什么”, “给我安排今晚的学习”, or wants to begin or continue a focused System Architect exam study session.
---

# 开展一次学习

1. 读取 `state/profile.json`、`state/progress.json` 和 `state/current.md`。
2. 若阶段仍为 `setup`，先确认用户是否要正式启动备考；不得仅因咨询而改变阶段。
3. 根据当天类型控制任务量：工作日晚间按 1–2 小时，周末按 3–4 小时。若用户指定时长，以指定时长为准。
4. 选择一个明确目标，并给出本次的学习产出和完成标准。避免一次塞入多个大主题。
5. 优先进行诊断，再决定哪些基础内容可以跳过。面向资深开发者讲清考试术语、边界、对比和得分表达。
6. 学习结束后，询问是否完成或进行小测；未得到用户反馈不得记为完成。
7. 仅依据实际结果更新进度和 `state/current.md`。

输出保持短小：本次目标、预计用时、学习步骤、完成标准。

