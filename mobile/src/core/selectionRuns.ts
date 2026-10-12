export type SelectionRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
};
type Node = {
  type: string;
  content?: string;
  attributes?: Record<string, unknown>;
  children?: Node[];
};
/** Preserve inline formatting while giving UIKit one continuous selectable buffer. */
export function selectionRuns(
  node: Node,
  inherited: Omit<SelectionRun, "text"> = {},
): SelectionRun[] {
  const style = { ...inherited };
  if (node.type === "strong") style.bold = true;
  if (node.type === "em") style.italic = true;
  if (node.type === "s") style.strike = true;
  if (node.type === "code_inline") style.code = true;
  if (node.type === "link") style.link = String(node.attributes?.href ?? "");
  if (node.type === "softbreak" || node.type === "hardbreak")
    return [{ ...style, text: "\n" }];
  if (node.children?.length)
    return node.children.flatMap((child) => selectionRuns(child, style));
  return node.content ? [{ ...style, text: node.content }] : [];
}
export type SelectionAction = {
  action: "reference" | "translate";
  text: string;
};
