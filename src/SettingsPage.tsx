import type { TranslationLanguage } from "./translationLanguage";
import { TranslationProfileSettings } from "./TranslationProfileSettings";
import type { AgentCatalogEntry } from "../shared/zotigod";
import { FavoriteModelSettings } from "./FavoriteModelSettings";
import { ArrowLeft, Settings, Server, RefreshCw } from "lucide-react";
import type { ThinkingDisplayMode } from "./thinkingDisplay";

export function SettingsPage({
  hostName,
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
  hostName: string;
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
  return (
    <main className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-chrome" />
        <button type="button" className="settings-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Zotigo</span>
        </button>
        <nav aria-label="Settings">
          <button type="button" className="settings-nav-item is-active" aria-current="page">
            <Settings size={16} />
            <span>General</span>
          </button>
        </nav>
      </aside>

      <section className="settings-main">
        <div className="settings-content">
          <h1>General</h1>

          <section className="settings-section" aria-labelledby="conversation-settings-heading">
            <h2 id="conversation-settings-heading">Conversation</h2>
            <div className="settings-card">
              <label className="settings-row">
                <span><strong>Translation language</strong><small>Translate selected conversation text into this language.</small></span>
                <select aria-label="Translation language" value={translationLanguage} onChange={event => onTranslationLanguageChange(event.target.value as TranslationLanguage)}>
                  <option value="zh-CN">Chinese</option><option value="en">English</option>
                </select>
              </label>
              <TranslationProfileSettings value={translationProfile} onChange={onTranslationProfileChange} />
              <label className="settings-row">
                <span>
                  <strong>Thinking display</strong>
                  <small>Controls Gemini and custom API sessions. Codex reasoning follows Codex events.</small>
                </span>
                <select
                  value={thinkingDisplay}
                  onChange={(event) => onThinkingDisplayChange(event.target.value as ThinkingDisplayMode)}
                >
                  <option value="expanded">Always expanded</option>
                  <option value="collapsed">Always collapsed</option>
                  <option value="latest">Collapse on next Thinking</option>
                </select>
              </label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="sync-settings-heading">
            <h2 id="sync-settings-heading">Sessions</h2>
            <div className="settings-card">
              <div className="settings-row">
                <span><strong>Sync sessions</strong><small>Import the latest Codex sessions from {hostName}.</small></span>
                <button type="button" className="settings-secondary-button" onClick={onSync} disabled={syncing}>
                  <RefreshCw size={15} />{syncing ? "Syncing…" : "Sync"}
                </button>
              </div>
            </div>
            {syncStatus && <p role="status">{syncStatus}</p>}
            {syncError && <p role="alert">{syncError}</p>}
          </section>

          <FavoriteModelSettings hostName={hostName} onCodexRefresh={onCodexRefresh} />

          <section className="settings-section" aria-labelledby="connection-settings-heading">
            <h2 id="connection-settings-heading">Connections</h2>
            <div className="settings-card">
              <div className="settings-row">
                <span>
                  <strong>Hosts</strong>
                  <small>Manage local and remote Zotigo daemon connections.</small>
                </span>
                <button type="button" className="settings-secondary-button" onClick={onManageHosts}>
                  <Server size={15} />
                  Manage
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
