import { useEffect, useRef, useState } from "react";
import { useClient } from "./ClientContext";
import { useLocale } from "./i18n";
import { t } from "../shared/i18n";
import type { ModelProfile, ModelSettings as Settings, ModelSettingsChange } from "../shared/modelSettings";

const blankProfile = (): ModelProfile => ({name:"",provider:"openai",model:"",base_url:"",thinking_level:"",context_window:0,max_output_tokens:null,mode:"",has_api_key:false});

export function ModelSettings({hostName}: {hostName:string}) {
  const locale = useLocale();
  const {api}=useClient();
  const [settings,setSettings]=useState<Settings>();
  const [draft,setDraft]=useState<ModelProfile>();
  const [editing,setEditing]=useState(false);
  const [key,setKey]=useState("");
  const [clearKey,setClearKey]=useState(false);
  const [busy,setBusy]=useState(false);
  const [testing,setTesting]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [reload,setReload]=useState(0);
  const [deleting,setDeleting]=useState<ModelProfile>();
  const alive=useRef(true);
  const inFlight=useRef(false);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let active=true;setLoading(true);setError("");
    void api.getModelSettings().then(data=>{if(active)setSettings(data);})
      .catch(()=>{if(active)setError(t("models.loadError"));})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[api,reload]);
  function open(profile?:ModelProfile) {
    setDraft(profile ? {...profile} : blankProfile());setEditing(!!profile);setKey("");setClearKey(false);setError("");setStatus("");setDeleting(undefined);
  }
  function patch(update:Partial<ModelProfile>) {setDraft(value=>value ? {...value,...update} : value);setStatus("");}
  function change(action:ModelSettingsChange["action"],profile:ModelProfile):ModelSettingsChange {
    return {revision:settings!.revision,action:action === "save" && !editing ? "create" : action,profile,...(action!=="save" ? {} : clearKey ? {api_key:""} : key ? {api_key:key} : {})};
  }
  async function submit(input:ModelSettingsChange,test=false) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setTesting(test);setError("");setStatus("");
    try {
      if(test) {
        const result=await api.testModelSettings(input);
        if(!alive.current)return;
        const reasons={authentication:"models.authentication",quota:"models.quota",model:"models.modelError",timeout:"models.timeout",connection:"models.connection"} as const;
        if(result.ok)setStatus(t("models.success"));else setError(t(reasons[result.reason ?? "connection"] ?? "models.connection"));
      } else {
        const result=await api.updateModelSettings(input);
        if(!alive.current)return;
        setSettings(result);setDraft(undefined);setKey("");setClearKey(false);setDeleting(undefined);setStatus(t("models.saved"));
      }
    } catch(cause) {if(alive.current)setError((cause instanceof Error ? cause.message : t("models.connection"))+" "+t("models.conflict"));}
    finally {inFlight.current=false;if(alive.current){setBusy(false);setTesting(false);}}
  }
  const thinkingLevels = draft?.provider === "openai"
    ? ["disabled", "none", "minimal", "low", "medium", "high", "xhigh", "max"]
    : (draft?.provider === "anthropic" || draft?.provider === "deepseek")
      ? ["disabled", "low", "medium", "high"] : ["low", "medium", "high"];
  const savedProfile = settings?.profiles.find(p => p.name === draft?.name && p.provider === draft?.provider);
  const outputDefault = savedProfile?.default_max_output_tokens ?? settings?.defaults?.max_output_tokens;
  const formatTokens = (value?: number) => value === undefined ? t("models.defaultUnknown") : value.toLocaleString(locale);
  return <div className="model-settings">
    <h1>{t("models.title")}</h1>
    <p><strong>{t("models.host",{host:hostName})}</strong></p>
    <p className="model-settings-help">{t("models.help")}</p>
    <p className="model-settings-help">{t("models.codex")}</p>
    {loading && <p role="status">{t("models.loading")}</p>}
    {error && <div role="alert"><p>{error}</p><button className="settings-secondary-button" disabled={busy || loading} onClick={()=>setReload(n=>n+1)}>{t("models.reload")}</button></div>}
    {status && <p role="status">{status}</p>}
    {settings && !loading && <>
      {!draft && <button className="settings-secondary-button" disabled={busy} onClick={()=>open()}>{t("models.add")}</button>}
      {!settings.profiles.length && !draft && <p>{t("models.empty")}</p>}
      {draft && <form className="settings-card model-settings-form" onSubmit={event=>{event.preventDefault();void submit(change("save",draft));}}>
        <fieldset disabled={busy}>
          <label>{t("models.name")}<input required pattern="[a-z0-9][a-z0-9_.-]{0,63}" maxLength={64} disabled={editing} value={draft.name} onChange={e=>patch({name:e.target.value})}/><small>{t("models.nameHelp")}</small></label>
          <label>{t("models.provider")}<select value={draft.provider} onChange={e=>patch({provider:e.target.value,mode:"",thinking_level:""})}>
            {!["openai","anthropic","gemini","deepseek"].includes(draft.provider) && <option value={draft.provider}>{draft.provider}</option>}
            <option value="openai">{t("models.openai")}</option><option value="anthropic">{t("models.anthropic")}</option><option value="gemini">{t("models.gemini")}</option><option value="deepseek">{t("models.deepseek")}</option>
          </select></label>
          <label>{t("models.model")}<input required maxLength={256} value={draft.model} onChange={e=>patch({model:e.target.value})}/></label>
          <label>{t("models.url")}<input type="url" value={draft.base_url} onChange={e=>patch({base_url:e.target.value})}/></label>
          <label>{t("models.key")}<input type="password" autoComplete="new-password" disabled={clearKey} placeholder={draft.has_api_key ? t("models.keySet") : t("models.keyEmpty")} value={key} onChange={e=>{setKey(e.target.value);setStatus("");}}/></label>
          {draft.has_api_key && <label className="model-key-clear"><input type="checkbox" checked={clearKey} onChange={e=>{setClearKey(e.target.checked);setKey("");setStatus("");}}/>{t("models.clearKey")}</label>}
          <details><summary>{t("models.advanced")}</summary>
            <label>{t("models.thinking")}<select value={draft.thinking_level} onChange={e=>patch({thinking_level:e.target.value})}>
              <option value="">{t("models.auto")}</option>
              {draft.thinking_level && !thinkingLevels.includes(draft.thinking_level) && <option value={draft.thinking_level}>{draft.thinking_level}</option>}
              {thinkingLevels.map(v=><option key={v} value={v}>{v}</option>)}
            </select></label>
            <label>{t("models.window")}<input type="number" min={0} max={100000000} step={1} placeholder={formatTokens(settings.defaults?.context_window)} value={draft.context_window || ""} onChange={e=>patch({context_window:Number(e.target.value)})}/><small>{t("models.windowHelp",{tokens:formatTokens(settings.defaults?.context_window)})}</small></label>
            <label>{t("models.output")}<input type="number" min={1} max={100000000} step={1} placeholder={formatTokens(outputDefault)} value={draft.max_output_tokens ?? ""} onChange={e=>patch({max_output_tokens:e.target.value==="" ? null : Number(e.target.value)})}/><small>{t("models.outputHelp",{tokens:formatTokens(outputDefault)})}</small>{draft.provider==="openai" && <small>{t("models.openaiOutputHelp")}</small>}</label>
            {draft.provider==="openai" && <label>{t("models.mode")}<select value={draft.mode} onChange={e=>patch({mode:e.target.value})}><option value="">{t("models.auto")}</option><option value="chat">{t("models.chat")}</option><option value="response">{t("models.response")}</option></select></label>}
          </details>
          <p className="model-settings-help">{t("models.testHelp")}</p>
          <div className="model-settings-actions">
            <button type="button" className="settings-secondary-button" onClick={e=>{if(e.currentTarget.form?.reportValidity())void submit(change("save",draft),true);}}>{testing ? t("models.testing") : t("models.test")}</button>
            <button type="button" className="settings-secondary-button" onClick={()=>{setDraft(undefined);setKey("");setClearKey(false);setError("");setStatus("");}}>{t("models.cancel")}</button>
            <button type="submit" className="settings-secondary-button">{t("models.save")}</button>
          </div>
        </fieldset>
      </form>}
      {!draft && settings.profiles.length > 0 && <div className="settings-card">
        {settings.profiles.map(profile=><div className="settings-row model-settings-row" key={profile.name}>
          <span><strong>{profile.name}{settings.default_profile===profile.name ? " · "+t("models.default") : ""}</strong><small>{profile.provider} · {profile.model}</small></span>
          <div className="model-settings-actions">
            {settings.default_profile!==profile.name && <button disabled={busy} className="settings-secondary-button" onClick={()=>void submit(change("default",profile))}>{t("models.makeDefault")}</button>}
            <button disabled={busy} className="settings-secondary-button" onClick={()=>open(profile)}>{t("models.edit")}</button>
            <button disabled={busy || (settings.default_profile===profile.name && settings.profiles.length>1)} title={t("models.deleteNotice")} className="settings-secondary-button" onClick={()=>{setDeleting(profile);setError("");}}>{t("models.remove")}</button>
          </div>
        </div>)}
      </div>}
      {deleting && <div role="alert" className="settings-card model-delete-confirm"><p>{t("models.deleteConfirm",{name:deleting.name})}</p><div className="model-settings-actions"><button disabled={busy} className="settings-secondary-button" onClick={()=>setDeleting(undefined)}>{t("models.cancel")}</button><button disabled={busy} className="settings-secondary-button" onClick={()=>void submit(change("delete",deleting))}>{t("models.remove")}</button></div></div>}
    </>}
  </div>;
}
