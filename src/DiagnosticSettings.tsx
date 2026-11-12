import { useEffect, useState } from "react";
import { useClient } from "./ClientContext";
import { t } from "../shared/i18n";
import type { DiagnosticRange, DiagnosticStatus } from "../shared/diagnostics";
import { exportPerformanceDiagnostics } from "./performanceDiagnostics";

export function DiagnosticSettings() {
  const { api } = useClient();
  const diagnostics = api.diagnostics;
  const [status, setStatus] = useState<DiagnosticStatus>();
  const [range, setRange] = useState<DiagnosticRange>("hour");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!diagnostics) return;
    let active = true;
    const refresh = () => diagnostics.status().then(value => { if (active) setStatus(value); }).catch(() => { if (active) setFailed(true); });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [diagnostics]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setFailed(false); setNotice("");
    try { await action(); if (diagnostics) setStatus(await diagnostics.status()); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <section className="settings-section" aria-labelledby="performance-settings-heading">
    <h2 id="performance-settings-heading">{t("diagnostics.title")}</h2>
    <div className="settings-card">
      {diagnostics ? <>
        <label className="settings-row">
          <span><strong>{t("diagnostics.mode")}</strong><small>{t("diagnostics.retention")}</small></span>
          <input className="diagnostics-toggle" type="checkbox" checked={status?.enabled ?? false} disabled={busy || !status} onChange={event => { const enabled = event.target.checked; void run(async () => { await diagnostics.enable(enabled); }); }} />
        </label>
        <div className="settings-row">
          <span><strong>{t("diagnostics.export")}</strong><small>{t("diagnostics.local")}</small></span>
          <div className="diagnostics-actions">
            <select aria-label={t("diagnostics.range")} value={range} disabled={busy} onChange={event => setRange(event.target.value as DiagnosticRange)}>
              <option value="hour">{t("diagnostics.hour")}</option><option value="today">{t("diagnostics.today")}</option><option value="all">{t("diagnostics.all")}</option>
            </select>
            <button type="button" className="settings-secondary-button" disabled={busy || !status || status.recording} onClick={() => void run(async () => { if (await diagnostics.export(range)) setNotice(t("diagnostics.exported")); })}>{t("diagnostics.export")}</button>
            <button type="button" className="settings-secondary-button" disabled={busy || !status || status.recording} onClick={() => { if (window.confirm(t("diagnostics.confirmClear"))) void run(async () => { await diagnostics.clear(); setNotice(t("diagnostics.cleared")); }); }}>{t("diagnostics.clear")}</button>
          </div>
        </div>
        <div className="settings-row">
          <span><strong>{t("diagnostics.recordTitle")}</strong><small>{t("diagnostics.recordHelp")}</small></span>
          <button type="button" className="settings-secondary-button" disabled={busy || !status?.enabled || status.recording} onClick={() => void run(() => diagnostics.record())}>{t(status?.recording ? "diagnostics.recording" : "diagnostics.record")}</button>
        </div>
        {(failed || status?.error) && <p className="diagnostics-status" role="alert">{t("diagnostics.failed")}</p>}
        {!!status?.dropped && <p className="diagnostics-status" role="status">{t("diagnostics.dropped", { count: status.dropped })}</p>}
        {notice && <p className="diagnostics-status" role="status">{notice}</p>}
      </> : <div className="settings-row">
        <span><strong>{t("diagnostics.export")}</strong><small>{t("diagnostics.help")}</small></span>
        <button type="button" className="settings-secondary-button" onClick={exportPerformanceDiagnostics}>{t("diagnostics.export")}</button>
      </div>}
    </div>
  </section>;
}
