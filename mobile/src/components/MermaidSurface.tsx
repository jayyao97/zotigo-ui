import { WebView } from "react-native-webview";
export function MermaidSurface({ html }: { html: string }) {
  return (
    <WebView
      source={{ html, baseUrl: "about:blank" }}
      // Wildcard routes navigation through our veto instead of WebView opening external URLs.
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
      javaScriptEnabled
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: "#101419" }}
    />
  );
}
