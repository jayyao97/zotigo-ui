import { Fragment, useState } from "react";
import { searchProviders, type SearchSettings as Settings, type SearchSettingsChange } from "../shared/modelSettings";
import { t } from "../shared/i18n";

type Draft = SearchSettingsChange["web_search"];

export function SearchSettings({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (change: Draft) => Promise<Settings | undefined> }) {
  const [draft, setDraft] = useState<Draft>({ provider: settings.provider });
  const changed = draft.provider !== settings.provider || draft.deepseek_key !== undefined || draft.tavily_key !== undefined;

  return <form className="settings-card model-settings-form" onSubmit={async event => {
    event.preventDefault();
    const saved = await onSave(draft);
    if (saved) setDraft({ provider: saved.provider });
  }}>
    <fieldset disabled={busy}><legend>{t("models.search")}</legend>
      <label>{t("models.searchProvider")}<select value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })}>
        <option value="">{t("models.searchDefault")}</option>
        {searchProviders.map(id => <option key={id} value={id}>{t(`models.${id}`)}</option>)}
      </select></label>
      {searchProviders.map(id => {
        const field = `${id}_key` as const;
        const provider = t(`models.${id}`);
        const hasKey = settings[`has_${id}_key`];
        const clear = draft[field] === "";
        return <Fragment key={id}>
          <label>{t("models.searchKey", { provider })}<input type="password" autoComplete="new-password"
            disabled={clear} value={draft[field] ?? ""} placeholder={t(hasKey ? "models.keySet" : "models.keyEmpty")}
            onChange={event => setDraft({ ...draft, [field]: event.target.value || undefined })} /></label>
          {hasKey && <label className="model-key-clear"><input type="checkbox" checked={clear}
            onChange={event => setDraft({ ...draft, [field]: event.target.checked ? "" : undefined })} />{t("models.clearSearchKey", { provider })}</label>}
        </Fragment>;
      })}
      <button className="settings-secondary-button" type="submit" disabled={!changed}>{t("models.save")}</button>
    </fieldset>
  </form>;
}
