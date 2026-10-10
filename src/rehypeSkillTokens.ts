import { skillTokens } from "../shared/skillCommands";

type HtmlNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
};

/** Decorate selected skill references in prose without changing code or links. */
export function rehypeSkillTokens({ skills }: { skills: string[] }) {
  return (tree: HtmlNode) => {
    function visit(node: HtmlNode) {
      if (!node.children || ["code", "pre", "a"].includes(node.tagName ?? "")) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { visit(child); return [child]; }
        const matches = skillTokens(child.value, skills);
        if (!matches.length) return [child];
        const parts: HtmlNode[] = [];
        let from = 0;
        for (const token of matches) {
          if (token.from > from) parts.push({ type: "text", value: child.value.slice(from, token.from) });
          parts.push({ type: "element", tagName: "span", properties: { className: ["inline-skill-token"], ariaLabel: `Skill: ${token.name}` },
            children: [
              { type: "element", tagName: "span", properties: { ariaHidden: "true" }, children: [{ type: "text", value: "✧ " }] },
              { type: "element", tagName: "span", properties: { className: ["inline-skill-name"] }, children: [{ type: "text", value: token.name }] },
            ] });
          from = token.to;
        }
        if (from < child.value.length) parts.push({ type: "text", value: child.value.slice(from) });
        return parts;
      });
    }
    visit(tree);
  };
}
