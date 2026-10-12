// Browser preview adapter; native builds resolve MermaidSurface.tsx instead.
import { createElement } from "react";
export function MermaidSurface({ html }: { html: string }) {
  return createElement("iframe", {
    title: "Mermaid diagram",
    sandbox: "allow-scripts",
    srcDoc: html,
    style: {
      border: 0,
      flex: 1,
      width: "100%",
      height: "100%",
      background: "#101419",
    },
  });
}
