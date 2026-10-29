import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from "electron";
import { translate } from "../shared/i18n/index";

// Use Chromium's loaded image for copying, and its existing download/auth path
// for saving. This covers inline images and modal/file previews alike.
export function imageContextMenu(
  params: Pick<ContextMenuParams, "mediaType" | "hasImageContents" | "srcURL" | "x" | "y">,
  contents: Pick<WebContents, "copyImageAt" | "downloadURL">,
  locale: string,
): MenuItemConstructorOptions[] {
  if (params.mediaType !== "image") return [];
  const language = locale === "zh-CN" ? "zh-CN" : "en";
  return [
    {
      label: translate(language, "imagePreview.saveImage"),
      enabled: params.hasImageContents && /^(https?:|data:image\/|blob:)/i.test(params.srcURL),
      click: () => contents.downloadURL(params.srcURL),
    },
    {
      label: translate(language, "imagePreview.copyImage"),
      enabled: params.hasImageContents,
      click: () => contents.copyImageAt(params.x, params.y),
    },
  ];
}
