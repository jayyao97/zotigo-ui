# Zotigo brand assets

The selected Zotigo mark is a white asymmetric soft four-corner spirit with two circular eyes. It replaces the earlier amber mascot. The original artwork and charcoal-background variant were created with ImageGen.

## Master artwork

- `resources/brand/zotigo-transparent.png`: full-resolution transparent artwork for in-app branding.
- `resources/brand/zotigo-charcoal.png`: full-resolution opaque charcoal-background application artwork.

Keep both masters in the repository. The transparent version is white and intended for dark surfaces.

## Runtime and packaging exports

- `public/brand/zotigo-app.png`: opaque application icon, 512px.
- `public/brand/zotigo-sprite.png`: transparent UI mark, 256px; shared by the sidebar and Web sign-in page.
- `public/brand/favicon-32.png`: browser favicon, 32px.
- `public/brand/apple-touch-icon.png`: home-screen icon, 180px.
- `resources/zotigo.icns`: macOS application icon, PNG representations at 128, 256, 512 and 1024px.
- `resources/zotigo.ico`: Windows application icon, containing a 256px PNG.

The mobile Expo config uses `resources/brand/zotigo-charcoal.png` directly; native prebuild generates the iPhone/iPad application icon sizes from this opaque master. Rebuild the native app after changing it.

PNG exports use browser canvas resampling. Keep all exports aligned with the masters when updating the mark. The Desktop packager uses the platform-specific icon, and the Linux launcher uses the bundled application PNG.

Background edit prompt: preserve the exact selected white silhouette, size, orientation and two round eye holes; fill the background and eye holes with flat charcoal #242424; no redesign, gradients, shadows, glow or additional details.
