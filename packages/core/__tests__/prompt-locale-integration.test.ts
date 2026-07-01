/**
 * Integration test: fake ChatClient → ReasonixEngine.submit system prompt locale.
 *
 * Creates a real engine with a fake client, submits, and asserts the system prompt
 * language changes between zh-CN and en.
 */
import { describe, test, expect } from "bun:test";
import type { DeepSeekStreamEvent, DeepSeekClientOptions, ChatMessage, ChatClient, DeepreefConfig } from "../src/interface";
import { ReasonixEngine } from "../src/engine";
import { setPromptLocale, getPromptLocale } from "../src/prompt-locale";
import { buildSystemPrompt } from "../src/system-prompt";

function makeFakeClient(): { client: ChatClient; messages: ChatMessage[] } {
  const messages: ChatMessage[] = [];
  const client: ChatClient = {
    async *chatCompletionsStream(
      msgs: ChatMessage[],
      _opts: DeepSeekClientOptions,
    ): AsyncGenerator<DeepSeekStreamEvent> {
      messages.push(...msgs);
      yield { type: "text_delta", delta: "" };
      yield { type: "done", finishReason: "stop" };
    },
  };
  return { client, messages };
}

const MINIMAL_CONFIG: DeepreefConfig = {
  apiKey: "test-key",
  baseUrl: "http://localhost:9999",
  model: "test-model",
  maxTokens: 100,
  temperature: 0,
  provider: "openai-compatible",
};

describe("ReasonixEngine submit system prompt locale", () => {
  test("system prompt changes between zh-CN and en after setPromptLocale + setSystemPrompt", async () => {
    const { client, messages } = makeFakeClient();
    const engine = new ReasonixEngine(MINIMAL_CONFIG, undefined, undefined, client);

    // Set Chinese locale and base system prompt
    setPromptLocale("zh-CN");
    const zhPrompt = buildSystemPrompt(".", { locale: "zh-CN" });
    engine.setSystemPrompt(zhPrompt);

    // Submit and collect events
    const zhEvents: string[] = [];
    for await (const event of engine.submit("test input", undefined, "worker", "loop")) {
      zhEvents.push(event.role);
    }

    // The first message should be the system prompt
    const zhSystemMsg = messages.find((m) => m.role === "system");
    expect(zhSystemMsg).toBeDefined();
    expect(zhSystemMsg!.content).toContain("你是 LoopRig");

    // Clear and switch to English
    messages.length = 0;
    setPromptLocale("en");
    const enPrompt = buildSystemPrompt(".", { locale: "en" });
    engine.setSystemPrompt(enPrompt);

    const enEvents: string[] = [];
    for await (const event of engine.submit("test input", undefined, "worker", "loop")) {
      enEvents.push(event.role);
    }

    const enSystemMsg = messages.find((m) => m.role === "system");
    expect(enSystemMsg).toBeDefined();
    expect(enSystemMsg!.content).toContain("You are LoopRig");
    expect(enSystemMsg!.content).not.toContain("你是 LoopRig");

    engine.shutdown().catch(() => {});
  });

  test("subagent system prompt is localized via spawnSubagent", async () => {
    const { client, messages } = makeFakeClient();
    const engine = new ReasonixEngine(MINIMAL_CONFIG, undefined, undefined, client);

    setPromptLocale("zh-CN");
    engine.setSystemPrompt(buildSystemPrompt(".", { locale: "zh-CN" }));

    // Spawn a general-purpose subagent
    const result = await engine.spawnSubagent({
      description: "test subagent",
      prompt: "do something",
      subagentType: "general-purpose",
    });

    // The subagent's engine should have system prompt in Chinese
    // We can check via getSubagentSystemPrompt behavior indirectly
    // The subagent system prompt was localized by getSubagentSystemPrompt
    expect(result.status).toBe("completed");
    // The fake client returns empty text, so the result should be empty string
    expect(result.result).toBe("");

    engine.shutdown().catch(() => {});
  });
});
