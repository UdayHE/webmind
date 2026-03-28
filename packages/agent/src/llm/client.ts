import Anthropic from "@anthropic-ai/sdk";
import type { DOMElement } from "../core/dom";
import type { Action } from "../actions/executor";

export interface LLMConfig {
  apiKey: string;
  model?: string;
}

const SYSTEM_PROMPT = `You are WebMind, a browser agent that controls web pages using natural language.
You receive a simplified DOM and a user instruction. Respond with a JSON action object.

Available actions:
- { "type": "click", "selector": "<css-selector>" }
- { "type": "type", "selector": "<css-selector>", "value": "<text>" }
- { "type": "scroll", "direction": "up"|"down", "amount": <pixels> }
- { "type": "navigate", "url": "<url>" }
- { "type": "done", "message": "<summary>" }

Respond ONLY with a valid JSON object. No explanation.`;

export async function getNextAction(
  config: LLMConfig,
  instruction: string,
  elements: DOMElement[]
): Promise<Action> {
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });

  const domSummary = elements
    .map((el) => `[${el.id}] <${el.tag}> "${el.text}" selector="${el.selector}"`)
    .join("\n");

  const message = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-6",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nDOM:\n${domSummary}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text) as Action;
}
