import { changeLanguage, useLocale } from "./i18n";
import { useEffect, useState } from "react";
import { useClient } from "./ClientContext";
import type { ClientApi } from "../shared/clientTypes";
import type { HostProfile } from "../shared/hosts";
import { ModelSettings } from "./ModelSettings";
import { UpdateSettings } from "./UpdateSettings";
import { t } from "../shared/i18n/index";
import type { TranslationLanguage } from "./translationLanguage";
import type { SendMode } from "./sendMode";
import { TranslationProfileSettings } from "./TranslationProfileSettings";
import type { AgentCatalogEntry } from "../shared/zotigod";
import { FavoriteModelSettings } from "./FavoriteModelSettings";
import { ArrowLeft, Settings, Server, RefreshCw } from "lucide-react";
import type { ThinkingDisplayMode } from "./thinkingDisplay";

export function SettingsPage({
  initialPage = "general",
  hostName,
  hosts,
  updateApi,
  defaultSendMode = "steering",
  onDefaultSendModeChange,
  onSync,
  syncing,
  syncStatus,
  syncError,
  onCodexRefresh,
  translationLanguage,
  onTranslationLanguageChange,
  translationProfile,
  onTranslationProfileChange,
  thinkingDisplay,
  onThinkingDisplayChange,
  onManageHosts,
  onBack,
}: {
  initialPage?: "general" | "models";
  hostName: string;
  hosts: HostProfile[];
  updateApi: ClientApi;
  defaultSendMode?: SendMode;
  onDefaultSendModeChange?: (mode: SendMode) => void;
  onSync: () => void;
  syncing: boolean;
  syncStatus: string;
  syncError: string;
  onCodexRefresh?: (catalog: AgentCatalogEntry) => void;
  translationLanguage: TranslationLanguage;
  onTranslationLanguageChange: (language: TranslationLanguage) => void;
  translationProfile: string;
  onTranslationProfileChange: (profile: string) => void;
  thinkingDisplay: ThinkingDisplayMode;
  onThinkingDisplayChange: (mode: ThinkingDisplayMode) => void;
  onManageHosts: () => void;
  onBack: () => void;
}) {
  const locale = useLocale();
  const { kind } = useClient();
  const [requestedModelHost, setModelHost] = useState("local");
  const modelHost = hosts.some(host => host.id === requestedModelHost) ? requestedModelHost : "local";
  const [modelEditing, setModelEditing] = useState(false);
  useEffect(() => { if (modelHost !== requestedModelHost) setModelHost(modelHost); }, [modelHost, requestedModelHost]);
  const [page, setPage] = useState<"general" | "models" | "updates">(initialPage);
  return (
    <main className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-chrome" />
        <button type="button" className="settings-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t("settingsPage.backToZotigo")}</span>
        </button>
        <nav aria-label={t("hostShell.settings")}>
          <button type="button" className={`settings-nav-item ${page === "general" ? "is-active" : ""}`} aria-current={page === "general" ? "page" : undefined} onClick={() => setPage("general")}>
            <Settings size={16} />
            <span>{t("settingsPage.general")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${page === "models" ? "is-active" : ""}`} aria-current={page === "models" ? "page" : undefined} onClick={() => setPage("models")}><Server size={16}/><span>{t("models.title")}</span></button>
          <button type="button" className={`settings-nav-item ${page === "updates" ? "is-active" : ""}`} aria-current={page === "updates" ? "page" : undefined} onClick={() => setPage("updates")}><RefreshCw size={16}/><span>{t("updates.title")}</span></button>
        </nav>
      </aside>

      <section className="settings-main">
        <div className="settings-content">
          {page === "updates" ? <UpdateSettings api={updateApi} hosts={hosts}/> : page === "models" ? <>
            <label className="settings-row settings-host-picker"><span><strong>{t("settings.targetHost")}</strong><small>{hosts.find(host => host.id === modelHost)?.baseUrl}</small></span>
              <select aria-label={t("settings.targetHost")} value={modelHost} disabled={modelEditing} onChange={event => setModelHost(event.target.value)}>
                {hosts.map(host => <option key={host.id} value={host.id}>{host.id === "local" ? t(kind === "desktop" ? "settings.thisComputer" : "settings.servingHost") : host.name}</option>)}
              </select>
            </label>
            {hosts.some(host => host.id === modelHost) && <ModelSettings key={modelHost} hostId={modelHost} hostName={modelHost === "local" ? t(kind === "desktop" ? "settings.thisComputer" : "settings.servingHost") : hosts.find(host => host.id === modelHost)!.name} onEditingChange={setModelEditing}/>}
          </> : <>
          <h1>{t("settingsPage.general")}</h1>
          <section className="settings-section"><div className="settings-card"><div className="settings-row"><span><strong>{t("models.title")}</strong><small>{t("settings.modelsHostHelp")}</small></span><button className="settings-secondary-button" onClick={() => setPage("models")}>{t("models.open")}</button></div></div></section>

          <section className="settings-section" aria-labelledby="language-settings-heading">
            <h2 id="language-settings-heading">{t("settings.language")}</h2>
            <div className="settings-card">
              <label className="settings-row">
                <span><strong>{t("settings.language")}</strong><small>{t("settings.languageHelp")}</small></span>
                <select aria-label={t("settings.language")} value={locale} onChange={event => changeLanguage(event.target.value === "zh-CN" ? "zh-CN" : "en")}>
                  <option value="en">{t("language.english")}</option>
                  <option value="zh-CN">{t("language.chinese")}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="conversation-settings-heading">
            <h2 id="conversation-settings-heading">{t("app.conversation")}</h2>
            <div className="settings-card">
              <label className="settings-row">
                <span><strong>{t("settingsPage.defaultSendMode")}</strong><small>{t("settingsPage.enterCtrlEnterUsesTheOtherMode")}</small></span>
                <select aria-label={t("settingsPage.defaultSendMode")} value={defaultSendMode} onChange={event => onDefaultSendModeChange?.(event.target.value as SendMode)}>
                  <option value="steering">{t("settingsPage.steering")}</option><option value="queue">{t("app.queueForNextTurn")}</option>
                </select>
              </label>
              <label className="settings-row">
                <span><strong>{t("settingsPage.translationLanguage")}</strong><small>{t("settingsPage.translateSelectedConversationTextIntoThisLanguage")}</small></span>
                <select aria-label={t("settingsPage.translationLanguage")} value={translationLanguage} onChange={event => onTranslationLanguageChange(event.target.value as TranslationLanguage)}>
                  <option value="zh-CN">{t("settingsPage.chinese")}</option><option value="en">{t("settingsPage.english")}</option>
                </select>
              </label>
              <TranslationProfileSettings value={translationProfile} onChange={onTranslationProfileChange} />
              <label className="settings-row">
                <span>
                  <strong>{t("settingsPage.thinkingDisplay")}</strong>
                  <small>{t("settingsPage.controlsGeminiAndCustomApiSessionsCodexReasoning")}</small>
                </span>
                <select
                  value={thinkingDisplay}
                  onChange={(event) => onThinkingDisplayChange(event.target.value as ThinkingDisplayMode)}
                >
                  <option value="expanded">{t("settingsPage.alwaysExpanded")}</option>
                  <option value="collapsed">{t("settingsPage.alwaysCollapsed")}</option>
                  <option value="latest">{t("settingsPage.collapseOnNextThinking")}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="sync-settings-heading">
            <h2 id="sync-settings-heading">{t("searchPalette.sessions")}</h2>
            <div className="settings-card">
              <div className="settings-row">
                <span><strong>{t("settingsPage.syncSessions")}</strong><small>{t("settings.syncHelp", { host: hostName })}</small></span>
                <button type="button" className="settings-secondary-button" onClick={onSync} disabled={syncing}>
                  <RefreshCw size={15} />{syncing ? t("settingsPage.syncing") : t("settingsPage.sync")}
                </button>
              </div>
            </div>
            {syncStatus && <p role="status">{syncStatus}</p>}
            {syncError && <p role="alert">{syncError}</p>}
          </section>

          <FavoriteModelSettings hostName={hostName} onCodexRefresh={onCodexRefresh} />

          <section className="settings-section" aria-labelledby="connection-settings-heading">
            <h2 id="connection-settings-heading">{t("settingsPage.connections")}</h2>
            <div className="settings-card">
              <div className="settings-row">
                <span>
                  <strong>{t("hostShell.hosts")}</strong>
                  <small>{t("settingsPage.manageLocalAndRemoteZotigoDaemonConnections")}</small>
                </span>
                <button type="button" className="settings-secondary-button" onClick={onManageHosts}>
                  <Server size={15} />
                  {t("settingsPage.manage")}</button>
              </div>
            </div>
          </section>
          </>}
        </div>
      </section>
    </main>
  );
}
