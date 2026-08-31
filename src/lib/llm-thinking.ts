/**
 * Qwen 3.8 thinks by default. Classification and JSON copy must turn that off
 * or the model spends the token budget on reasoning and returns empty / non-JSON
 * content — the failure mode that broke MagSafe votes and brand classification
 * the moment the slug moved off Qwen 3.7.
 *
 * Three provider shapes, one intent:
 *   - OpenRouter: `reasoning: { effort: "none" }`
 *   - DashScope native: `enable_thinking: false`
 *   - vLLM / SGLang: `chat_template_kwargs.enable_thinking: false`
 *
 * Do not send all three shapes together: strict gateways reject unknown keys,
 * and OpenRouter documents `effort` and `enabled` as alternative controls.
 * Non-Qwen models receive no extra parameters.
 */
export function disabledThinkingParams(
  model: string,
  baseURL?: string,
): Record<string, unknown> {
  if (!model.toLowerCase().includes("qwen3.8")) return {};

  let hostname = "";
  try {
    hostname = new URL(baseURL ?? "").hostname.toLowerCase();
  } catch {
    // A custom or relative endpoint is treated as a generic OpenAI-compatible
    // server, where Qwen reads the chat-template parameter.
  }

  if (hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai")) {
    return { reasoning: { effort: "none" } };
  }
  if (
    hostname.endsWith(".aliyuncs.com") ||
    hostname.endsWith(".alibabacloud.com")
  ) {
    return { enable_thinking: false };
  }
  return { chat_template_kwargs: { enable_thinking: false } };
}

/** True when the provider rejected a thinking-control field, not the request. */
export function isThinkingParamRejected(err: unknown): boolean {
  const message = (
    err instanceof Error ? err.message : String(err)
  ).toLowerCase();
  return (
    message.includes("reasoning") ||
    message.includes("enable_thinking") ||
    message.includes("chat_template_kwargs") ||
    message.includes("thinking")
  );
}
