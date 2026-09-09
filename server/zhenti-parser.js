import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyComprehensive } from './topic-classify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ZHENTI_DIR = path.join(ROOT, 'zhenti');

const YEAR_LABELS = {
  '2020下': '2020 下半年', '2021下': '2021 下半年', '2022下': '2022 下半年',
  '2023下': '2023 下半年', '2024上': '2024 上半年', '2024下': '2024 下半年',
  '2025上': '2025 上半年', '2025下': '2025 下半年',
};

export function yearLabel(year) {
  return YEAR_LABELS[year] || year;
}

/**
 * Parse a zhenti Markdown file into an array of question objects.
 * Handles the standard format:
 *   ## 第N题
 *   [title text]
 *   - **A.** option
 *   **正确答案：X**
 */
export function parseZhentiFile(filePath, year, subject) {
  if (!existsSync(filePath)) return [];
  // Normalize source files from different platforms so Markdown blocks and
  // line-anchored parsing behave consistently.
  const content = readFileSync(filePath, 'utf-8').replace(/\r\n?/g, '\n');
  const questions = [];
  let passageRef = null; // 最近一道含空号的题干原文，供后续无题干小题复用

  // Split on question headers, keep delimiter. 兼容 ## 与 ### 两种标题层级。
  // 注意不能用 \b：中文「题」不是 ASCII 单词字符，「题」与换行之间不存在词边界
  const sections = content.split(/(?=^#{2,3} 第\d+题\s*$)/m);

  for (const section of sections) {
    const numMatch = section.match(/^#{2,3} 第(\d+)题/);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1], 10);

    // Extract options A-D (handle both . and ．)
    const optionMatches = [...section.matchAll(/^[-*] \*\*([A-D])[.．]\*\* (.+)$/mg)];
    if (optionMatches.length < 2) continue;
    const options = optionMatches.map(m => m[2].trim());

    // Extract answer letter
    const answerMatch = section.match(/\*\*正确答案[：:]\s*([A-D])\*\*/);
    if (!answerMatch) continue;
    const answer = answerMatch[1].charCodeAt(0) - 65; // A=0

    // Extract title while preserving Markdown block structure. Source-maintenance
    // notes are not part of the exam stem and remain hidden in practice mode.
    const beforeAnswer = section.split(/\*\*正确答案[：:]/)[0];
    const body = beforeAnswer
      .replace(/^#{2,3} 第[\d-]+题[^\n]*\n/, '')
      .replace(/第\d+题选项[：:][^\n]*\n?/g, '')
      .replace(/^[-*] \*\*[A-D][.．]\*\*.+$/mg, '')
      .replace(/^---$/mg, '')
      .replace(/^>\s+\*\*(?:结构化转录|结构化重绘示意|共用题干)[^\n]*$/mg, '')
      .trim();

    // Rebuilding this line-by-line inserts blank lines between table rows and
    // code-fence contents, which makes valid Markdown impossible to render.
    const stem = body;
    // 阅读理解 / 双空题：Markdown 只在首题写材料，后续小题只有「第N题选项」。
    // 仅当上一段材料里确实有本题空号（如 （7）（12））时才复用，避免串题。
    if (stem) passageRef = stem;
    const belongsToPassage = !stem && passageRef && new RegExp(`[（(]\\s*${num}\\s*[）)]`).test(passageRef);
    const finalTitle = stem || (belongsToPassage ? passageRef : '') || `第${num}题`;

    questions.push({
      id: `${year}-${String(num).padStart(3, '0')}`,
      year,
      subject,
      source: `${yearLabel(year)} · ${subject}`,
      num,
      title: finalTitle,
      options,
      answer,
      topic: classifyComprehensive({ title: finalTitle, options }).name,
      difficulty: '中等',
      explain: '',
    });
  }

  return questions;
}

let _cache = null;

/** Load all zhenti questions, cached after first call. */
export function loadAllQuestions() {
  if (_cache) return _cache;
  const all = [];
  let dirs;
  try { dirs = readdirSync(ZHENTI_DIR); } catch { return []; }

  for (const yearDir of dirs) {
    const yearPath = path.join(ZHENTI_DIR, yearDir);
    try {
      if (!statSync(yearPath).isDirectory()) continue;
      for (const file of readdirSync(yearPath)) {
        if (!file.endsWith('.md')) continue;
        if (file.includes('回忆版')) continue; // skip alternative versions
        const subject = file.replace('.md', '');
        const qs = parseZhentiFile(path.join(yearPath, file), yearDir, subject);
        all.push(...qs);
      }
    } catch { /* skip unreadable dirs */ }
  }

  _cache = all;
  return all;
}

/** 可用年份列表（按年份倒序，含各年综合知识题数）。 */
export function listYears() {
  const counts = new Map();
  for (const q of loadAllQuestions()) {
    if (q.subject !== '综合知识') continue;
    counts.set(q.year, (counts.get(q.year) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0], 'zh'))
    .map(([year, count]) => ({ year, label: yearLabel(year), count }));
}
