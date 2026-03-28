import { parseDOM } from "./core/dom";
import { getNextAction } from "./llm/client";
import { executeAction } from "./actions/executor";
import type { LLMConfig } from "./llm/client";

export interface WebMindConfig extends LLMConfig {
  maxSteps?: number;
}

export async function runAgent(instruction: string, config: WebMindConfig): Promise<void> {
  const maxSteps = config.maxSteps ?? 10;

  for (let step = 0; step < maxSteps; step++) {
    console.log(`[webmind] Step ${step + 1}: parsing DOM...`);
    const elements = parseDOM();

    console.log(`[webmind] Asking LLM for next action...`);
    const action = await getNextAction(config, instruction, elements);

    console.log(`[webmind] Executing action:`, action);
    await executeAction(action);

    if (action.type === "done") break;

    // small delay between steps
    await new Promise((r) => setTimeout(r, 500));
  }
}

export { parseDOM } from "./core/dom";
export { executeAction } from "./actions/executor";
