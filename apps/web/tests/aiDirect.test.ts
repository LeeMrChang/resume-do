import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_COMMON_PROMPT, AI_CONDENSE_PROMPT, AI_POLISH_PROMPT } from '../src/aiPrompts';
import {
  DeepSeekError,
  buildWarnings,
  rewriteWithDeepSeek,
  testDeepSeekKey,
  validateRewriteResult,
} from '../src/deepseek';
import { AI_MODELS, apiKeyLooksValid, defaultAiSettings, maskApiKey } from '../src/aiSettings';

const promptFile = (name: string) =>
  fileURLToPath(new URL(`../../api/src/main/resources/prompts/ai-rewrite-${name}.txt`, import.meta.url));

test('browser prompts stay identical to the server prompt files', async () => {
  assert.equal(AI_COMMON_PROMPT, await readFile(promptFile('common'), 'utf8'));
  assert.equal(AI_POLISH_PROMPT, await readFile(promptFile('polish'), 'utf8'));
  assert.equal(AI_CONDENSE_PROMPT, await readFile(promptFile('condense'), 'utf8'));
});

test('AI settings helpers validate, mask and default the key', () => {
  assert.deepEqual(defaultAiSettings(), {
    enabled: false,
    apiKey: '',
    model: AI_MODELS[0],
    sessionOnly: false,
  });
  assert.equal(apiKeyLooksValid(' sk-abcdefghijklmnop1234 '), true);
  assert.equal(apiKeyLooksValid('sk-short'), false);
  assert.equal(apiKeyLooksValid('Bearer sk-abcdefghijklmnop1234'), false);
  assert.equal(maskApiKey('sk-abcdefghijklmnop1234'), 'sk-****1234');
  assert.equal(maskApiKey(''), '');
});

test('validateRewriteResult rejects blank, oversized, markup and control characters', () => {
  assert.doesNotThrow(() => validateRewriteResult('负责订单模块开发。', '负责订单模块开发与慢 SQL 优化。'));
  assert.throws(() => validateRewriteResult('原文', '   '), /不可用/);
  assert.throws(() => validateRewriteResult('短原文', `<p>${'字'.repeat(300)}</p>`), /不可用/);
  assert.throws(() => validateRewriteResult('原文', 'x'.repeat(12001)), /不可用/);
  assert.throws(() => validateRewriteResult('原文', '正常\u0000隐藏控制符'), /不可用/);
});

test('buildWarnings flags new numbers and a condense result that did not shrink', () => {
  assert.deepEqual(buildWarnings('负责接口开发。', '负责接口开发。', 'polish'), [
    'AI 建议可能存在事实偏差，请核对公司、时间、技术名称和成果后再采用',
  ]);
  assert.equal(buildWarnings('把耗时降低 30%', '把耗时降低 50%', 'polish').length, 2);
  assert.equal(buildWarnings('原文较长一些', '原文较长一些', 'condense').length, 2);
  assert.equal(buildWarnings('原文较长', '原文', 'condense').length, 1);
});

test('rewriteWithDeepSeek sends the user key, prompts and JSON payload, then parses the envelope', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ rewrittenText: '负责订单模块开发与慢 SQL 优化。' }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const output = await rewriteWithDeepSeek({
      apiKey: 'sk-abcdefghijklmnop1234',
      model: 'deepseek-v4-pro',
      action: 'polish',
      text: '负责订单模块开发，也处理了一些慢 SQL。',
      section: 'evaluation',
      targetRole: 'Java 后端工程师',
    });
    assert.equal(output.rewrittenText, '负责订单模块开发与慢 SQL 优化。');
    assert.equal(output.warnings.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get('authorization'), 'Bearer sk-abcdefghijklmnop1234');
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.equal(body.stream, false);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.messages[0].content, `${AI_COMMON_PROMPT}\n${AI_POLISH_PROMPT}`);
    assert.deepEqual(JSON.parse(body.messages[1].content), {
      text: '负责订单模块开发，也处理了一些慢 SQL。',
      section: 'evaluation',
      targetRole: 'Java 后端工程师',
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('rewriteWithDeepSeek maps provider failures to actionable codes', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [[401, 'AI_KEY_INVALID'], [402, 'AI_KEY_BALANCE'], [429, 'AI_KEY_RATE_LIMITED'], [500, 'AI_UNAVAILABLE']] as const) {
      globalThis.fetch = (async () => new Response('{}', { status })) as typeof fetch;
      await assert.rejects(
        rewriteWithDeepSeek({ apiKey: 'sk-abcdefghijklmnop1234', model: 'deepseek-flash', action: 'polish', text: '原文', section: 'summary' }),
        (error: unknown) => error instanceof DeepSeekError && error.code === code,
      );
    }
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await assert.rejects(
      rewriteWithDeepSeek({ apiKey: 'sk-abcdefghijklmnop1234', model: 'deepseek-flash', action: 'polish', text: '原文', section: 'summary' }),
      (error: unknown) => error instanceof DeepSeekError && error.code === 'AI_NETWORK',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('testDeepSeekKey checks the key without spending tokens', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    await testDeepSeekKey('sk-abcdefghijklmnop1234');
    assert.deepEqual(calls, ['https://api.deepseek.com/models']);

    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    await assert.rejects(testDeepSeekKey('sk-abcdefghijklmnop1234'), (error: unknown) => error instanceof DeepSeekError && error.code === 'AI_KEY_INVALID');
  } finally {
    globalThis.fetch = original;
  }
});
