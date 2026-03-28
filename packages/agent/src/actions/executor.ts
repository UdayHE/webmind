export type Action =
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; value: string }
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "navigate"; url: string }
  | { type: "done"; message: string };

export async function executeAction(action: Action): Promise<void> {
  switch (action.type) {
    case "click": {
      const el = document.querySelector(action.selector) as HTMLElement | null;
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.click();
      break;
    }
    case "type": {
      const el = document.querySelector(action.selector) as HTMLInputElement | null;
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.focus();
      el.value = action.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      break;
    }
    case "scroll": {
      window.scrollBy(0, action.direction === "down" ? action.amount : -action.amount);
      break;
    }
    case "navigate": {
      window.location.href = action.url;
      break;
    }
    case "done": {
      console.log("[webmind] Task complete:", action.message);
      break;
    }
  }
}
