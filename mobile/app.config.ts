import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Zotigo",
  slug: "zotigo-mobile",
  icon: "../resources/brand/zotigo-charcoal.png",
  version: "0.1.0",
  scheme: "zotigo",
  orientation: "default",
  userInterfaceStyle: "dark",
  // System screens (camera, pickers, permission prompts) follow the bundle's
  // languages; the app sets which one at launch (platform/systemLanguage).
  locales: { en: "./locales/en.json", "zh-Hans": "./locales/zh-Hans.json" },
  ios: {
    bundleIdentifier: "dev.zotigo.mobile",
    supportsTablet: true,
    infoPlist: {
      NSLocalNetworkUsageDescription:
        "Connect to your Zotigo daemons on your private network.",
      // User-managed daemons may use HTTP over a trusted private network or VPN.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      ITSAppUsesNonExemptEncryption: false,
      CFBundleLocalizations: ["en", "zh-Hans"],
      CFBundleAllowMixedLocalizations: true,
    },
  },
  android: { package: "dev.zotigo.mobile" },
  plugins: [
    ["expo-build-properties", { ios: { enableSceneSupport: true } }],
    // Tokens use the Keychain without biometrics, so no Face ID prompt string.
    ["expo-secure-store", { faceIDPermission: false }],
    [
      "expo-video",
      { supportsBackgroundPlayback: false, supportsPictureInPicture: false },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Attach a screenshot or photo to a Zotigo conversation.",
        cameraPermission: "Take a photo to attach to a Zotigo conversation.",
        microphonePermission: false,
      },
    ],
  ],
};
export default config;
