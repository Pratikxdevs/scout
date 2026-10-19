"use node";
import type { ActionCtx } from '../_generated/server';

/**
 * LLM adapter (SPEC §7): one OpenAI-compatible chat completion endpoint.
 * Works with OpenAI, Groq, OpenRouter, vLLM — anything speaking
 * /chat/completions. Keys live only on the Convex deployment env
 * (LLM_API_KEY, optional LLM_MODEL, optional LLM_BASE_URL).
 */

export class LlmError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

interface ChatMessage { role: 'system' | 'user'; content: string }

export function llmKey(_ctx: ActionCtx): string | null {
  const key = process.env.LLM_API_KEY;
  return typeof key === 'string' && key.length >= 8 ? key : null;
}

/** Structured call: forces JSON, repairs once on malformed output. */
export async function completeJson<T>(
  ctx: ActionCtx,
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature?: number } ,
): Promise<T> {
  const key = llmKey(ctx);
  if (key === null) throw new LlmError('LLM_API_KEY is not set on this Convex deployment', false);
  const base = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';

  const call = async (repair: string | null): Promise<unknown> => {
    const msgList: Array<{ role: string; content: string }> = repair
      ? [...messages, { role: 'assistant' as const, content: 'Previous reply was not valid JSON.', }, { role: 'user' as const, content: repair }]
      : messages;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: msgList,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') throw new LlmError('LLM timed out (90s)', true);
      throw new LlmError(`LLM unreachable: ${e instanceof Error ? e.message : 'network'}`, true);
    });
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      const detail = await res.text().catch(() => '');
      throw new LlmError(`LLM HTTP ${res.status} ${detail.slice(0, 200)}`, retryable);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new LlmError('LLM returned empty content', true);
    }
    return text;
  };

  let out = await call(null);
  let parsed = safeJsonParse(out) as T | null;
  if (parsed === null) {
    out = await call('Fix the previous reply so it parses as a single JSON object. Reply with ONLY the JSON object.');
    parsed = safeJsonParse(out) as T | null;
  }
  if (parsed === null) {
    throw new LlmError('LLM JSON could not be repaired after one retry', false);
  }
  return parsed;
}

export function safeJsonParse(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }
  // substring scan for first balanced {…}
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch { return null; }
      }
    }
  }
  return null;
}
