---
name: research-topic
description: This skill should be used when the user asks “讲解这个知识点”, “查一下考纲”, “考试时间是什么”, “找备考资料”, “希赛网怎么说”, or needs current, sourced System Architect exam information.
---

# 检索与讲解

1. 先判断问题是否具有时效性。考试政策、日期、考纲和教材版本必须联网核验。
2. 需要搜索、发现候选来源或核验最新信息时，必须先使用 `exa-search` skill。它位于 `.claude/skills/exa-search/SKILL.md`，通过 Bash 调用 `POST https://api.exa.ai/search`，不依赖 Exa CLI 或 MCP。
3. 若 `exa-search` 未自动展开，先读取 `.claude/skills/exa-search/SKILL.md` 并严格按其中的 HTTP 调用方式执行。密钥优先取 `EXA_API_KEY`，否则从 `~/.config/exa/key` 读入临时 shell 变量；禁止输出密钥。
4. 不得运行 `which exa`、寻找 Exa MCP，或仅因工具列表里没有名为 Exa 的独立工具就声称 Exa 不可用。只有实际调用 `https://api.exa.ai/search` 返回错误后，才能报告失败，并保留状态码或非敏感错误信息。
5. `WebFetch` 只能读取 Exa 已找到或用户已给出的明确 URL，不得用于搜索、猜测 URL、遍历公告列表或替代 Exa 来源发现。
6. 搜索时优先通过 `includeDomains`、语义明确的 query 或后续交叉检索寻找官方来源。来源优先级：主管部门/考试机构官方信息 > 官方教材或标准 > 可核验真题 > 高质量培训与技术资料 > 论坛和个人文章。
7. 希赛网可作参考，但不得作为唯一依据来断言政策、官方评分标准或原题身份。
8. 对关键结论进行交叉核验；记录标题、URL、发布方、发布日期（若有）、访问日期和适用范围。
9. 只将有长期价值的整理结果写入 `knowledge/`，并在 `materials/sources.json` 登记。保存摘要和少量必要短引文，不复制整篇受版权保护内容。
10. 面向资深开发者输出：一句话结论、考试定义、与工程实践的对应、常见混淆、答题关键词、来源。
11. 来源冲突时列出冲突，不擅自制造确定答案。
