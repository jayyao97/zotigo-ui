const headingSelector = ".sidebar-section-heading, .project-row-shell, .workspace-row-shell";
const headingButtons = ":scope > button, :scope > .sidebar-section-actions > button, :scope > .project-row-actions > button, :scope > .workspace-row-actions > button";

// Clip painted rows rather than their containers: workspace menus must still
// open above their ancestors, and the native sidebar material must stay visible.
export function updateSidebarClipping(scroller: HTMLElement) {
  const scrollTop = scroller.getBoundingClientRect().top;
  const headings = [...scroller.querySelectorAll<HTMLElement>(headingSelector)].map(element => ({
    element,
    bounds: element.getBoundingClientRect(),
  }));
  const byGroup = new Map(headings.map(heading => [heading.element.parentElement, heading]));
  const boundaryFor = (element: HTMLElement) => {
    let boundary = scrollTop;
    for (let parent = element.parentElement; parent && parent !== scroller; parent = parent.parentElement) {
      const heading = byGroup.get(parent);
      if (heading && heading.element !== element) boundary = Math.max(boundary, heading.bounds.bottom);
    }
    return boundary;
  };
  const clips: Array<{ element: HTMLElement; top: number }> = [];
  const measure = (element: HTMLElement, boundary: number) => {
    const bounds = element.getBoundingClientRect();
    clips.push({ element, top: Math.min(bounds.height + 16, Math.max(0, boundary - bounds.top)) });
  };
  for (const heading of headings) {
    const boundary = boundaryFor(heading.element);
    for (const button of heading.element.querySelectorAll<HTMLElement>(headingButtons)) measure(button, boundary);
  }
  for (const row of scroller.querySelectorAll<HTMLElement>(".sidebar-session, .sidebar-empty, .workspace-empty-action, .workspace-sessions-more")) {
    measure(row, boundaryFor(row));
  }
  const trees = [...scroller.querySelectorAll<HTMLElement>(".workspace-list, .workspace-sessions")].map(element => {
    // A project's line runs beside its workspaces, not behind their labels.
    // Only ancestor headings occlude it; child headings must not sever it.
    const boundary = boundaryFor(element);
    return { element, top: Math.max(0, boundary - element.getBoundingClientRect().top) };
  });
  // Finish geometry reads before writes to avoid forcing layout per row.
  for (const { element, top } of clips) {
    element.style.clipPath = top > 0 ? `inset(${top}px -16px -16px)` : "";
  }
  for (const { element, top } of trees) {
    element.style.setProperty("--sidebar-tree-clip-top", `${top}px`);
  }
}
