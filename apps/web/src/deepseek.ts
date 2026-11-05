import { AI_COMMON_PROMPT, AI_CONDENSE_PROMPT, AI_POLISH_PROMPT } from './aiPrompts';

export type AiAction = 'polish' | 'condense';

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/models';

const HTML = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NUMBER = /\d+(?:[.,]\d+)*(?:[%万亿kKwW])?/g;

export class DeepSeekError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeepSeekError';
    this.code = code;
  }
}

function providerError(status: number): DeepSeekError {
  if (status === 401 || status === 403) {
    return new DeepSeekError('AI_KEY_INVALID', 'API Key 无效或已失效，请重新填写');
  }
  if (status === 402) {
    return new DeepSeekError('AI_KEY_BALANCE', '你的 DeepSeek 账户余额不足，请充值后再试');
  }
  if (status === 429) {
    return new DeepSeekError('AI_KEY_RATE_LIMITED', '你的 API Key 触发限流，请稍后再试');
  }
  if (status === 400) {
    return new DeepSeekError('AI_REQUEST_REJECTED', 'DeepSeek 拒绝了请求，请检查所选模型是否可用');
  }
  return new DeepSeekError('AI_UNAVAILABLE', 'DeepSeek 服务暂不可用，请稍后重试');
}

export function validateRewriteResult(source: string, result: string): void {
  if (!result || !result.trim() || result.length > Math.min(12000, source.length * 3 + 200)
    || HTML.test(result) || CONTROL.test(result)) {
    throw new DeepSeekError('AI_INVALID_RESULT', 'DeepSeek 返回的结果不可用，请重试');
  }
}

export function buildWarnings(source: string, result: string, action: AiAction): string[] {
  const warnings = ['AI 建议可能存在事实偏差，请核对公司、时间、技术名称和成果后再采用'];
  const sourceNumbers = new Set(source.match(NUMBER) ?? []);
  const newNumbers = (result.match(NUMBER) ?? []).filter((value) => !sourceNumbers.has(value));
  if (newNumbers.length > 0) {
    warnings.push('结果出现原文未包含的数字，请重点核对，勿直接采用');
  }
  if (action === 'condense' && [...result].length >= [...source].length) {
    warnings.push('本次结果未缩短，原文可能已经较为精简，可保留原文或重新尝试');
  }
  return warnings;
}

export interface RewriteInput {
  apiKey: string;
  model: string;
  action: AiAction;
  text: string;
  section: string;
  targetRole?: string;
  signal?: AbortSignal;
}

export interface RewriteOutput {
  rewrittenText: string;
  warnings: string[];
}

export async function rewriteWithDeepSeek({
  apiKey,
  model,
  action,
  text,
  section,
  targetRole,
  signal,
}: RewriteInput): Promise<RewriteOutput> {
  const instruction = action === 'polish' ? AI_POLISH_PROMPT : AI_CONDENSE_PROMPT;
  const body = {
    model,
    stream: false,
    max_tokens: 8192,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${AI_COMMON_PROMPT}\n${instruction}` },
      { role: 'user', content: JSON.stringify({ text, section, targetRole: targetRole ?? '' }) },
    ],
  };

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === 'AbortError') {
      throw new DeepSeekError('AI_TIMEOUT', '请求超时，请检查网络后重试');
    }
    throw new DeepSeekError('AI_NETWORK', '无法连接 DeepSeek，请检查网络或代理后重试');
  }

  if (!response.ok) throw providerError(response.status);

  const envelope = await response.json().catch(() => null);
  const choice = envelope?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') {
    throw new DeepSeekError('AI_INVALID_RESULT', 'DeepSeek 返回的结果不可用，请重试');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(choice.message.content);
  } catch {
    throw new DeepSeekError('AI_INVALID_RESULT', 'DeepSeek 返回的结果不可用，请重试');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).length !== 1
    || typeof (parsed as { rewrittenText?: unknown }).rewrittenText !== 'string') {
    throw new DeepSeekError('AI_INVALID_RESULT', 'DeepSeek 返回的结果不可用，请重试');
  }

  const rewrittenText = (parsed as { rewrittenText: string }).rewrittenText.trim();
  validateRewriteResult(text, rewrittenText);
  return { rewrittenText, warnings: buildWarnings(text, rewrittenText, action) };
}

export async function testDeepSeekKey(apiKey: string, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal,
    });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === 'AbortError') {
      throw new DeepSeekError('AI_TIMEOUT', '连接 DeepSeek 超时，请稍后重试');
    }
    throw new DeepSeekError('AI_NETWORK', '无法连接 DeepSeek，请检查网络');
  }
  if (!response.ok) throw providerError(response.status);
}
