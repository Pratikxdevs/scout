"use node";
import type { ActionCtx } from '../_generated/server';

/**
 * LLM adapter (SPEC §7): one OpenAI-compatible chat completion endpoint.
 * Works with OpenAI, Groq, OpenRouter, vLLM — anything speaking
 * /chat/completions. Keys live only on the Convex deployment env
 * (LLM_API_KEY + LLM_API_KEY_1…3, optional LLM_MODEL, optional
 * LLM_BASE_URL, optional sampling knobs).
 *
 * Key pool: calls rotate through the configured keys round-robin, and a
 * key-scoped failure (429 rate limit, 401/403 revoked key) rotates to the
 * next key before the error surfaces. Only when EVERY key fails does the
 * call report the problem.
 */

export class LlmError extends Error {
  retryable: boolean;
  status: number | undefined;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

interface ChatMessage { role: 'system' | 'user'; content: string }

/** Env slots, in rotation order. Missing slots are skipped. */
const KEY_SLOTS = ['LLM_API_KEY', 'LLM_API_KEY_1', 'LLM_API_KEY_2', 'LLM_API_KEY_3'] as const;

function keyPool(): string[] {
  const out: string[] = [];
  for (const name of KEY_SLOTS) {
    const k = process.env[name];
    if (typeof k === 'string' && k.length >= 8 && !deadKeys.has(k)) out.push(k);
  }
  return out;
}

/** Keys that answered 401/403 are dead for this isolate's lifetime — skip
 *  them instead of paying a round trip on every other call. */
const deadKeys = new Set<string>();

let keyCursor = 0;

/** Pool size probe (dev verification). */
export function llmKeyCount(): number {
  return keyPool().length;
}

/** The primary key (or null when nothing is configured). */
export function llmKey(_ctx: ActionCtx): string | null {
  const pool = keyPool();
  return pool.length === 0 ? null : pool[0];
}

/** Run one call across the key pool: rotate on a key-scoped failure. */
async function rotateKeys<T>(attempt: (key: string) => Promise<T>): Promise<T> {
  const pool = keyPool();
  if (pool.length === 0) {
    throw new LlmError('LLM_API_KEY is not set on this Convex deployment', false);
  }
  const start = Math.abs(keyCursor++) % pool.length;
  let last: LlmError | null = null;
  for (let i = 0; i < pool.length; i += 1) {
    try {
      return await attempt(pool[(start + i) % pool.length]);
    } catch (e) {
      const le = e instanceof LlmError ? e : new LlmError(e instanceof Error ? e.message : 'unknown LLM failure', true);
      last = le;
      // 429 = this key is rate limited; 401/403 = this key is dead.
      const revoked = le.status === 401 || le.status === 403;
      if (revoked) deadKeys.add(pool[(start + i) % pool.length]);
      const keyScoped = revoked || le.status === 429;
      if (keyScoped && i < pool.length - 1) continue;
      throw le;
    }
  }
  throw last ?? new LlmError('LLM call failed', true);
}

function envNumber(name: string): number | null {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Reasoning models (gpt-oss) want temperature 1, top_p 1, an explicit
 *  reasoning budget, and `max_completion_tokens` instead of `max_tokens`. */
function isReasoningModel(model: string, base: string): boolean {
  const m = model.toLowerCase();
  return m.includes('gpt-oss') || m.includes('o1') || m.includes('o3') || base.includes('groq.com');
}

/** Structured call: forces JSON, repairs once on malformed output. */
export async function completeJson<T>(
  ctx: ActionCtx,
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature?: number },
): Promise<T> {
  const key = llmKey(ctx);
  if (key === null) throw new LlmError('LLM_API_KEY is not set on this Convex deployment', false);
  const base = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const reasoning = isReasoningModel(model, base);
  const envTemp = envNumber('LLM_TEMPERATURE');
  const envTopP = envNumber('LLM_TOP_P');
  const effort = process.env.LLM_REASONING_EFFORT ?? '';
  // Reasoning models must run at temperature 1; other models keep the
  // caller's value, falling back to the deployment default.
  const temperature = reasoning ? (envTemp ?? 1) : (opts.temperature ?? envTemp ?? 0.2);
  const topP = envTopP ?? (reasoning ? 1 : undefined);
  const maxTokens = opts.maxTokens;

  const call = async (apiKey: string, repair: string | null): Promise<unknown> => {
    const msgList: Array<{ role: string; content: string }> = repair
      ? [...messages, { role: 'assistant' as const, content: 'Previous reply was not valid JSON.' }, { role: 'user' as const, content: repair }]
      : messages;
    const body: Record<string, unknown> = {
      model,
      messages: msgList,
      temperature,
      response_format: { type: 'json_object' },
    };
    if (reasoning) body.max_completion_tokens = maxTokens;
    else body.max_tokens = maxTokens;
    if (topP !== undefined) body.top_p = topP;
    if (effort.trim() !== '') body.reasoning_effort = effort.trim();

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') throw new LlmError('LLM timed out (90s)', true);
      throw new LlmError(`LLM unreachable: ${e instanceof Error ? e.message : 'network'}`, true);
    });
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      const detail = await res.text().catch(() => '');
      throw new LlmError(`LLM HTTP ${res.status} ${detail.slice(0, 200)}`, retryable, res.status);
    }
    const payload = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new LlmError('LLM returned empty content', true);
    }
    return text;
  };

  let out = await rotateKeys((apiKey) => call(apiKey, null));
  let parsed = safeJsonParse(out) as T | null;
  if (parsed === null) {
    out = await rotateKeys((apiKey) => call(apiKey, 'Fix the previous reply so it parses as a single JSON object. Reply with ONLY the JSON object.'));
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
