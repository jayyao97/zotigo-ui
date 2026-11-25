import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { LogOut, Settings } from "lucide-react";
import { t } from "../../shared/i18n/index";
import { useLocale } from "../i18n";

const shortcut = () => /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘," : "Ctrl+,";

/**
 * The sidebar footer: who is using Zotigo and the connection state, opening a
 * menu of account-level actions. Settings is the first; more can follow.
 */
export function AccountMenu({ status, onOpenSettings, onSignOut }: { status: string; onOpenSettings?: () => void; onSignOut?: () => void }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    // Pointer down, not click: Electron's drag regions never deliver a click.
    const closeOutside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnBlur = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [open]);
  const close = (refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const choose = (action: () => void) => { close(false); action(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // The narrow Web drawer also closes on Escape; only the menu should.
      event.preventDefault(); event.stopPropagation(); close(true); return;
    }
    if (event.key === "Tab") { close(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length;
    list[next]?.focus();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget && !container.current?.contains(event.relatedTarget as Node)) setOpen(false);
  };
  return <div className="account-menu" ref={container} onBlur={onBlur}>
    <button ref={trigger} type="button" className="account-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)}>
      <span className="account-menu-avatar"><img className="user-chip" src="./brand/zotigo-sprite.png" alt="" aria-hidden="true" /></span>
      <span className="account-menu-identity"><strong>{t("app.zotigo")}</strong><span>{status}</span></span>
    </button>
    {open && <div id={menuId} className="account-menu-popover" role="menu" ref={menu} aria-label={t("hostShell.accountMenu")} onKeyDown={onKeyDown}>
      {onOpenSettings && <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onOpenSettings)}><Settings size={15} /><span>{t("hostShell.settings")}</span><kbd>{shortcut()}</kbd></button>}
      {onSignOut && <>
        {onOpenSettings && <div className="account-menu-separator" role="separator" />}
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(onSignOut)}><LogOut size={15} /><span>{t("app.signOut")}</span></button>
      </>}
    </div>}
  </div>;
}
