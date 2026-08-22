import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const llmConfigPath = path.join(ROOT, 'config', 'llm.json');
let llmConfig;
/** 本地 27B 上下文 32K：输入侧按字符保守封顶，给输出和工具定义留余量。 */
export const CONTEXT_CHAR_BUDGET = 10000;
// 32K 是输入、输出、工具定义和多轮历史共享的总上下文窗口。
// 4096 给完整解析留出空间，同时避免输出预算吞掉上下文余量。
export const MAX_OUTPUT_TOKENS = 4096;

export async function getLlmConfig() {
  if (!llmConfig) llmConfig = JSON.parse(await readFile(llmConfigPath, 'utf-8'));
  const { baseURL, apiKey, model, maxOutputTokens } = llmConfig;
  if (!baseURL || !apiKey || !model) throw new Error('LLM 配置不完整，请填写 config/llm.json');
  return {
    baseURL: baseURL.replace(/\/$/, ''),
    apiKey,
    model,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : MAX_OUTPUT_TOKENS,
  };
}

export async function getLlmModel() {
  return (await getLlmConfig()).model;
}
