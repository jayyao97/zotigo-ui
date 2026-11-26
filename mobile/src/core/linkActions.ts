import { t } from "@zotigo/shared/i18n/index";
import { markdownLinkCopyText, parseMarkdownLink } from "@zotigo/shared/markdownLinks";

export type LinkAction = "open" | "copy" | "cancel";

/**
 * What a link in a message does when tapped or long-pressed. A tap opens it
 * directly, except an external link, which asks first and also offers Copy.
 * A long press offers Open and Copy for anything that can be copied (web and
 * mail addresses, file paths); for an in-page anchor it just opens.
 * Throws for a link this app does not open.
 */
export function linkActions(href: string, longPress: boolean):
  | { prompt: false }
  | { prompt: true; title: string; message?: string; actions: LinkAction[]; copy?: string } {
  const target = parseMarkdownLink(href);
  const copy = markdownLinkCopyText(href);
  if (longPress && copy)
    return { prompt: true, title: copy, actions: ["open", "copy", "cancel"], copy };
  if (target.kind === "external")
    return {
      prompt: true,
      title: t("mobile.openExternalLink"),
      message: target.url,
      actions: copy ? ["open", "copy", "cancel"] : ["open", "cancel"],
      copy,
    };
  return { prompt: false };
}
