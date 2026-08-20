import { readFile } from 'node:fs/promises';

const llmConfigPath = '/home/liqinsi/storage/config/opencode/opencode.json';
export const CHAT_MODEL = 'qwen3.6-27b';
/** 本地 27B 上下文 32K：输入侧按字符保守封顶，给输出和工具定义留余量。 */
export const CONTEXT_CHAR_BUDGET = 10000;
export const MAX_OUTPUT_TOKENS = 900;

let llmConfigPromise;
export async function getLlmConfig() {
  if (!llmConfigPromise) llmConfigPromise = readFile(llmConfigPath, 'utf-8').then(JSON.parse);
  const config = await llmConfigPromise;
  const provider = config.provider?.sribd;
  if (!provider?.options?.baseURL || !provider?.options?.apiKey) throw new Error('未找到 opencode 的 sribd LLM 配置');
  return { baseURL: provider.options.baseURL.replace(/\/$/, ''), apiKey: provider.options.apiKey };
}
