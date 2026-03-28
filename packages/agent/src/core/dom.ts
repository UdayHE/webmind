export interface DOMElement {
  id: string;
  tag: string;
  text: string;
  role: string | null;
  placeholder: string | null;
  selector: string;
  interactable: boolean;
}

const INTERACTABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

export function parseDOM(): DOMElement[] {
  const elements: DOMElement[] = [];
  const all = document.querySelectorAll("*");

  all.forEach((el, index) => {
    const tag = el.tagName.toLowerCase();
    const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ?? "";
    const role = el.getAttribute("role");
    const placeholder = el.getAttribute("placeholder");
    const interactable =
      INTERACTABLE_TAGS.has(tag) ||
      role === "button" ||
      (el as HTMLElement).onclick !== null;

    if (!text && !interactable) return;

    elements.push({
      id: `el-${index}`,
      tag,
      text,
      role,
      placeholder,
      selector: buildSelector(el),
      interactable,
    });
  });

  return elements;
}

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter(
    (c) => c.tagName === el.tagName
  );
  const index = siblings.indexOf(el) + 1;
  return `${buildSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}
