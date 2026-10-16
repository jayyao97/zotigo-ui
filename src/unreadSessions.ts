export { mergeReadState, mergeSessionReadStates, canAcknowledgeSession } from "../shared/sessionReadState";

// Measure the actual conversation surface, including inherited visibility and
// responsive display:none rules, rather than duplicating CSS breakpoints.
export function conversationIsVisible(element: HTMLElement | null): boolean {
  return !!element && element.getClientRects().length > 0
    && element.ownerDocument.defaultView?.getComputedStyle(element).visibility === "visible";
}
