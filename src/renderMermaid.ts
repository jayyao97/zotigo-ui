let renderer: Promise<typeof import("mermaid").default> | undefined;

function loadRenderer() {
  renderer ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      look: "classic",
      themeVariables: {
        darkMode: true,
        background: "#212121",
        primaryColor: "#173b61",
        primaryTextColor: "#dceeff",
        primaryBorderColor: "#335d7d",
        lineColor: "#9aabbc",
        secondaryColor: "#283b4e",
        tertiaryColor: "#282828",
      },
      fontFamily: "system-ui, sans-serif",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 500,
      // Diagram frontmatter must not relax application rendering constraints.
      secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges",
        "suppressErrorRendering", "htmlLabels", "flowchart", "dompurifyConfig", "theme", "themeVariables", "themeCSS", "look", "fontFamily"],
    });
    return mermaid;
  }).catch((error) => { renderer = undefined; throw error; });
  return renderer;
}

export async function renderMermaid(code: string): Promise<string> {
  if (code.length > 50_000) throw new Error("Diagram is too large to preview.");
  const mermaid = await loadRenderer();
  const container = document.createElement("div");
  container.className = "mermaid-render-host";
  container.setAttribute("aria-hidden", "true");
  document.body.append(container);
  try {
    const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, code, container);
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const element = document.documentElement;
    if (element.localName !== "svg" || document.querySelector("parsererror")) throw new Error("Could not render diagram.");
    // An SVG used as an image needs intrinsic dimensions for the zoom viewer.
    const viewBox = element.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
    if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      element.setAttribute("width", String(viewBox[2]));
      element.setAttribute("height", String(viewBox[3]));
    }
    return new XMLSerializer().serializeToString(element);
  } finally {
    container.remove();
  }
}
