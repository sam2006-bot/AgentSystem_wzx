// 本机 Ollama 的结构化输出调用，文本 Agent 和图像证据共用。
// 未设置模型名时各 Agent 只使用规则，不发起任何请求。

export function llmOptions(env = process.env) {
  return {
    model: env.TEXT_MODEL || '',
    url: env.OLLAMA_URL || 'http://127.0.0.1:11434',
  };
}

export async function chatJSON({
  model,
  url = 'http://127.0.0.1:11434',
  fetch: send = fetch,
  timeout = 30000,
  system,
  prompt,
  images,
  schema,
}) {
  const messages = system ? [{ role: 'system', content: system }] : [];
  messages.push({ role: 'user', content: prompt, ...(images ? { images } : {}) });
  const response = await send(new URL('/api/chat', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      options: { temperature: 0 },
      messages,
    }),
  });
  if (!response.ok) throw Error('模型服务返回 ' + response.status);
  return JSON.parse((await response.json()).message.content);
}
