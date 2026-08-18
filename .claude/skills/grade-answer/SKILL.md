---
name: grade-answer
description: This skill should be used when the user submits an answer, says “批改”, “评分”, “我的答案是”, or asks how many points an exam response would receive.
---

# 严格评分

1. 找到当前待批改题目及其来源。若上下文中没有完整题目或可靠答案依据，先补齐依据，不凭印象判分。
2. 默认严格模拟真实考试。区分官方答案/评分依据与基于公开解析的估算。
3. 综合知识题：给出正误、正确答案、逐项理由和易错点。
4. 案例或论文题：按可识别评分点逐项列出命中、部分命中、遗漏和错误；给出分值。无权威细则时标注“估算分”。
5. 给出一份符合考试表达的参考作答，但不要把风格差异误判为知识错误。
6. 把真实作答、评分、来源、知识标签和日期写入 `state/attempts.json`。错误或薄弱项写入 `state/mistakes.json`，同类错题合并统计而非无限重复。
7. 更新 `state/progress.json` 与 `state/current.md`，确保统计可由 attempts 推导。

输出顺序：分数与结论、评分点明细、参考作答、错误原因、下一步动作。

