import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Zotigo",
  slug: "zotigo-mobile",
  icon: "../resources/brand/zotigo-charcoal.png",
  version: "0.1.0",
  scheme: "zotigo",
  orientation: "default",
  userInterfaceStyle: "dark",
  ios: {
    bundleIdentifier: "dev.zotigo.mobile",
    supportsTablet: true,
    infoPlist: {
      NSLocalNetworkUsageDescription:
        "Connect to your Zotigo daemons on your private network.",
      // User-managed daemons may use HTTP over a trusted private network or VPN.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: { package: "dev.zotigo.mobile" },
  plugins: [
    "expo-secure-store",
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
