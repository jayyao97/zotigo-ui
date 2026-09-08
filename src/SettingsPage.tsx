import { ArrowLeft, Settings, Server } from "lucide-react";
import type { ThinkingDisplayMode } from "./thinkingDisplay";

export function SettingsPage({
  thinkingDisplay,
  onThinkingDisplayChange,
  onManageHosts,
  onBack,
}: {
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
                <span>
                  <strong>Thinking display</strong>
                  <small>Controls Gemini and custom API sessions. Codex reasoning follows Codex events.</small>
                </span>
                <select
                  value={thinkingDisplay}
                  onChange={(event) => onThinkingDisplayChange(event.target.value as ThinkingDisplayMode)}
                >
                  <option value="auto">Auto</option>
                  <option value="expanded">Always expanded</option>
                  <option value="collapsed">Always collapsed</option>
                </select>
              </label>
            </div>
          </section>

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
