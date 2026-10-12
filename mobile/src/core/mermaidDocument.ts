/** Offline document only. Diagram input is inert JSON, never executable markup. */
export function mermaidDocument(runtime: string, source: string): string {
  if (source.length > 50000)
    throw new Error("Diagram exceeds the 50,000 character preview limit.");
  const json = JSON.stringify(source)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:16px;background:#101419;color:#edf2f7;font:15px system-ui}svg{max-width:none}#error{white-space:pre-wrap}</style></head><body><div id="diagram">Rendering diagram…</div><pre id="error"></pre><script>${runtime.replace(/<\/script/gi, "<\\/script")}</script><script>
const source=${json};
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'dark',htmlLabels:false,flowchart:{htmlLabels:false},suppressErrorRendering:true,maxTextSize:50000,maxEdges:300,secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','htmlLabels','flowchart','dompurifyConfig','theme','themeVariables','themeCSS','look','fontFamily']});
mermaid.render('diagram-svg',source).then(({svg})=>{document.getElementById('diagram').innerHTML=svg;}).catch(e=>{document.getElementById('diagram').textContent='';document.getElementById('error').textContent='Diagram could not be rendered. '+String(e.message||e).slice(0,1000);});
</script></body></html>`;
}
