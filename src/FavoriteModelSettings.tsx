import { useEffect, useState } from "react";
import { useClient } from "./ClientContext";
import { favoriteKey, useSavedModelFavorites, type ModelFavorite } from "./modelFavorites";
import { compatibleReasoningEffort } from "./conversation/ConversationComposer";
import type { AgentCatalogEntry, AgentKind, RuntimeProfile } from "../shared/zotigod";

export function FavoriteModelSettings({ hostName, onCodexRefresh }: { hostName: string; onCodexRefresh?: (catalog: AgentCatalogEntry) => void }) {
  const { api } = useClient();
  const favorites = useSavedModelFavorites();
  const [agents, setAgents] = useState<AgentCatalogEntry[]>([]);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [agent, setAgent] = useState<AgentKind>("codex");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [refreshed, setRefreshed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setRefreshed(false);
    void (async () => {
      const [catalog, state] = await Promise.all([api.getAgents(), api.getDesktopState()]);
      const installedCodex = catalog.agents.find((item) => item.id === "codex");
      let availableAgents = catalog.agents;
      if (installedCodex && (retry > 0 || !installedCodex.models?.length)) {
        const prepared = await api.prepareCodex();
        availableAgents = catalog.agents.map((item) => item.id === "codex" ? prepared : item);
      }
      const workspace = state.workspaces.find((item) => item.id === state.selectedWorkspaceId);
      const config = await api.getProfiles(workspace?.root_path, workspace ? undefined : "global");
      if (!active) return;
      setAgents(availableAgents); setProfiles(config.profiles);
      const codex = availableAgents.find((item) => item.id === "codex");
      if (retry > 0 && codex) { onCodexRefresh?.(codex); setRefreshed(true); }
      setAgent((current) => retry > 0 && availableAgents.some((item) => item.id === current) ? current : availableAgents.some((item) => item.id === "codex") ? "codex" : "zotigo");
      const models = availableAgents.find((item) => item.id === "codex")?.models ?? [];
      const first = (retry > 0 ? models.find((item) => item.id === model) : undefined) ?? models.find((item) => item.is_default) ?? models[0];
      setModel(first?.id ?? "");
      setEffort(compatibleReasoningEffort(first?.supported_reasoning_efforts ?? [], retry > 0 ? effort : "medium"));
      setProfile(config.profiles.find((item) => item.name === config.default_profile)?.name ?? config.profiles[0]?.name ?? "");
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load models."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry, onCodexRefresh]);
  const models = agents.find((item) => item.id === "codex")?.models ?? [];
  const selectedModel = models.find((item) => item.id === model);
  const favorite: ModelFavorite = agent === "codex" ? { agent, model, reasoningEffort: effort } : { agent, profile };
  const exists = favorites.items.some((item) => favoriteKey(item) === favoriteKey(favorite));
  const valid = agent === "codex" ? Boolean(selectedModel && selectedModel.supported_reasoning_efforts.includes(effort)) : profiles.some((item) => item.name === profile);
  function label(item: ModelFavorite) {
    return item.agent === "codex" ? `${models.find((model) => model.id === item.model)?.display_name ?? item.model} · ${item.reasoningEffort}` : item.profile;
  }
  return <section className="settings-section" aria-labelledby="favorite-models-heading">
    <h2 id="favorite-models-heading">Favorite models</h2>
    <p className="settings-favorites-description">Shown first in the model picker. Saved locally for {hostName}.</p>
    <div className="settings-card">
      <div className="settings-row">
        <span><strong>Codex models</strong><small>Reload models from Codex on {hostName}. Does not install or update Codex.</small></span>
        <button type="button" className="settings-secondary-button" disabled={loading || !agents.some((item) => item.id === "codex")} onClick={() => setRetry((value) => value + 1)}>Refresh models</button>
      </div>
      {refreshed && <div className="settings-row" role="status"><span><small>Codex models refreshed ({models.length}).{agents.find((item) => item.id === "codex")?.version ? ` Runtime: ${agents.find((item) => item.id === "codex")!.version}.` : ""}</small></span></div>}
      {favorites.items.length === 0 && <div className="settings-row"><span><small>No favorite models yet.</small></span></div>}
      {favorites.items.map((item) => <div className="settings-row" key={favoriteKey(item)}>
        <span><strong>{label(item)}</strong><small>{item.agent === "codex" ? "Codex" : "Zotigo"}</small></span>
        <button type="button" className="settings-secondary-button" aria-label={`Remove favorite ${label(item)}`} onClick={() => favorites.toggle(item)}>Remove</button>
      </div>)}
      <form className="settings-favorite-form" onSubmit={(event) => { event.preventDefault(); if (valid && !exists && !loading && !error) favorites.toggle(favorite); }}>
        <h3>Add favorite</h3>
        {loading ? <p role="status">Loading models…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p> : <>
          <div className="settings-favorite-fields">
            <label>Runtime<select value={agent} onChange={(event) => setAgent(event.target.value as AgentKind)}>{agents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            {agent === "codex" ? <>
              <label>Model<select value={model} onChange={(event) => { setModel(event.target.value); setEffort(compatibleReasoningEffort(models.find((item) => item.id === event.target.value)?.supported_reasoning_efforts ?? [], effort)); }}>{models.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
              <label>Thinking<select value={effort} onChange={(event) => setEffort(event.target.value)}>{selectedModel?.supported_reasoning_efforts.map((value) => <option key={value}>{value}</option>)}</select></label>
            </> : <label>Profile<select value={profile} onChange={(event) => setProfile(event.target.value)}>{profiles.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>}
          </div>
          <button type="submit" className="settings-secondary-button" disabled={!valid || exists}>{exists ? "Already added" : "Add favorite"}</button>
        </>}
      </form>
    </div>
  </section>;
}
