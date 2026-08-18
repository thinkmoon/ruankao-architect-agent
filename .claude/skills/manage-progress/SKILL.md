---
name: manage-progress
description: This skill should be used when the user asks “查看进度”, “复盘”, “错题本”, “记录今天学习”, “我学完了”, or wants learning history and next-step recommendations.
---

# 管理学习档案

1. 读取 `state/` 下全部相关状态，核对结构化统计与实际记录。
2. 只记录用户已经完成或本会话中实际完成的事项；计划不等于完成。
3. 将知识点状态限制为 `not_started`、`learning`、`reviewing`、`mastered`。只有存在足够练习证据时才能标为 `mastered`。
4. 错题记录包含知识标签、错误类型、次数、最后发生日期和复习状态。
5. 汇报进度时列出：当前阶段、已有证据、薄弱点、最近一次学习、建议的一个下一步。
6. 不因长时间未使用而责备用户；保持直截了当，不灌鸡汤。

