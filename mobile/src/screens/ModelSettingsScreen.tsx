import { SettingsPage, SettingsGroup, SettingRow } from "../components/SettingsLayout";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { t } from "@zotigo/shared/i18n/index";
import type { ModelProfile, ModelSettings, ModelSettingsChange } from "@zotigo/shared/modelSettings";
import { useDaemon } from "../platform/context";
import { useLocale } from "../platform/i18n";
import { ApiError } from "../core/client";
import { modelDraftError } from "../core/modelSettings";
import { Action, Loading, Notice, TextField, styles } from "../components/ui";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";

const blank = (): ModelProfile => ({ name: "", provider: "openai", model: "", base_url: "", thinking_level: "", context_window: 0, max_output_tokens: null, mode: "", has_api_key: false });

export function ModelSettingsScreen() {
  const locale = useLocale();
  const client = useDaemon();
  const [settings, setSettings] = useState<ModelSettings>();
  const [draft, setDraft] = useState<ModelProfile>();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [choice, setChoice] = useState<"provider" | "thinking_level" | "mode">();
  const [deleting, setDeleting] = useState<ModelProfile>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void client.getModelSettings().then(value => { if (active) setSettings(value); })
      .catch(() => { if (active) setError(t("models.loadError")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, reload]);
  function open(profile?: ModelProfile) {
    setDraft(profile ? { ...profile } : blank());
    setEditing(!!profile); setApiKey(""); setClearKey(false); setAdvanced(false); setError(""); setStatus("");
  }
  function patch(value: Partial<ModelProfile>) { setDraft(current => current && { ...current, ...value }); setStatus(""); }
  async function submit(action: ModelSettingsChange["action"], profile: ModelProfile, test = false) {
    if (lock.current || !settings) return;
    if (action === "save") {
      const invalid = modelDraftError(profile);
      if (invalid) { setError(invalid); return; }
    }
    const input: ModelSettingsChange = {
      revision: settings.revision, action: action === "save" && !editing ? "create" : action, profile,
      ...(action !== "save" ? {} : clearKey ? { api_key: "" } : apiKey ? { api_key: apiKey } : {}),
    };
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try {
      if (test) {
        const result = await client.testModelSettings(input);
        if (!alive.current) return;
        const reasons = { authentication: "models.authentication", quota: "models.quota", model: "models.modelError", timeout: "models.timeout", connection: "models.connection" } as const;
        if (result.ok) setStatus(t("models.success"));
        else setError(t(reasons[result.reason ?? "connection"] ?? "models.connection"));
      } else {
        const value = await client.updateModelSettings(input);
        if (!alive.current) return;
        setSettings(value);
        if (action !== "default") { setDraft(undefined); setApiKey(""); setClearKey(false); setDeleting(undefined); }
        setStatus(t("models.saved"));
      }
    } catch (cause) {
      // Never echo a provider error that could contain the entered API key.
      if (alive.current) setError(t(cause instanceof ApiError && cause.status === 409 ? "models.conflict" : "models.connection"));
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const levels = draft?.provider === "openai" ? ["disabled", "none", "minimal", "low", "medium", "high", "xhigh", "max"]
    : draft?.provider === "anthropic" || draft?.provider === "deepseek" ? ["disabled", "low", "medium", "high"] : ["low", "medium", "high"];
  const options = choice === "provider" ? ["openai", "anthropic", "gemini", "deepseek"] : choice === "thinking_level" ? ["", ...levels] : ["", "chat", "response"];
  const tokens = (value?: number) => value === undefined ? t("models.defaultUnknown") : value.toLocaleString(locale);
  const original = settings?.profiles.find(profile => profile.name === draft?.name);
  const saved = settings?.profiles.find(profile => profile.name === draft?.name && profile.provider === draft?.provider);
  return <SettingsPage>
    <View style={{ gap: 4 }}>
      <Text style={[styles.text, { fontWeight: "600" }]}>{draft ? editing ? draft.name : t("models.add") : t("models.host", { host: client.connection.name })}</Text>
      {!draft && <Text style={styles.muted}>{t("models.codex")}</Text>}
    </View>
    {loading && <Loading />}
    {!!error && <View><Notice text={error} error /><Action label={t("models.reload")} disabled={busy || loading} onPress={() => setReload(value => value + 1)} /></View>}
    {!!status && <Notice text={status} />}
    {settings && !loading && <>
      {!draft && <>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.muted}>{t("mobile.zotigoProfiles")}</Text>
          <Action label={t("models.add")} disabled={busy} onPress={() => open()} />
        </View>
        {settings.profiles.length > 0 ? <SettingsGroup>
          {settings.profiles.map((profile, index) => <SettingRow key={profile.name} title={profile.name} subtitle={`${profile.provider} · ${profile.model}`} value={profile.name === settings.default_profile ? t("models.default") : undefined} onPress={busy ? undefined : () => open(profile)} last={index === settings.profiles.length - 1} />)}
        </SettingsGroup> : <Notice text={t("models.empty")} />}
        <Text style={styles.muted}>{t("models.help")}</Text>
      </>}
      {draft && <>
        <SettingsGroup form>
          <TextField label={t("models.name")} value={draft.name} editable={!busy && !editing} maxLength={64} onChangeText={name => patch({ name })} />
          {!editing && <Text style={styles.muted}>{t("models.nameHelp")}</Text>}
          <SettingRow title={t("models.provider")} value={draft.provider} onPress={busy ? undefined : () => setChoice("provider")} last />
          <TextField label={t("models.model")} value={draft.model} editable={!busy} maxLength={256} onChangeText={model => patch({ model })} />
          <TextField label={t("models.url")} value={draft.base_url} editable={!busy} keyboardType="url" onChangeText={base_url => patch({ base_url })} />
          <TextField label={t("models.key")} secureTextEntry value={apiKey} editable={!busy && !clearKey} placeholder={t(draft.has_api_key ? "models.keySet" : "models.keyEmpty")} onChangeText={value => { setApiKey(value); setStatus(""); }} />
          {draft.has_api_key && <ChoiceRow title={t("models.clearKey")} selected={clearKey} disabled={busy} onPress={() => { setClearKey(!clearKey); setApiKey(""); }} />}
        </SettingsGroup>
        <SettingsGroup>
          <SettingRow title={t("models.advanced")} expanded={advanced} onPress={() => setAdvanced(!advanced)} last={!advanced} />
          {advanced && <View style={{ padding: 16, gap: 16 }}>
            <SettingRow title={t("models.thinking")} value={draft.thinking_level || t("models.auto")} onPress={busy ? undefined : () => setChoice("thinking_level")} last />
            <TextField label={t("models.window")} keyboardType="number-pad" value={draft.context_window ? String(draft.context_window) : ""} editable={!busy} placeholder={tokens(settings.defaults?.context_window)} onChangeText={value => patch({ context_window: value === "" ? 0 : Number(value) })} />
            <Text style={styles.muted}>{t("models.windowHelp", { tokens: tokens(settings.defaults?.context_window) })}</Text>
            <TextField label={t("models.output")} keyboardType="number-pad" value={draft.max_output_tokens === null ? "" : String(draft.max_output_tokens)} editable={!busy} placeholder={tokens(saved?.default_max_output_tokens ?? settings.defaults?.max_output_tokens)} onChangeText={value => patch({ max_output_tokens: value === "" ? null : Number(value) })} />
            <Text style={styles.muted}>{t("models.outputHelp", { tokens: tokens(saved?.default_max_output_tokens ?? settings.defaults?.max_output_tokens) })}</Text>
            {draft.provider === "openai" && <><Text style={styles.muted}>{t("models.openaiOutputHelp")}</Text><SettingRow title={t("models.mode")} value={draft.mode || t("models.auto")} onPress={busy ? undefined : () => setChoice("mode")} last /></>}
          </View>}
        </SettingsGroup>
        <View style={{ gap: 12 }}>
          <Text style={styles.muted}>{t("models.testHelp")}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Action label={t("models.test")} disabled={busy} onPress={() => void submit("save", draft, true)} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Action secondary label={t("models.cancel")} disabled={busy} onPress={() => { setDraft(undefined); setApiKey(""); setClearKey(false); setError(""); setStatus(""); }} />
              <Action label={busy ? t("app.saving") : t("models.save")} disabled={busy} onPress={() => void submit("save", draft)} />
            </View>
          </View>
        </View>
        {editing && <SettingsGroup>
          <SettingRow title={draft.name === settings.default_profile ? t("models.default") : t("models.makeDefault")} onPress={busy || draft.name === settings.default_profile ? undefined : () => { if (original) void submit("default", original); }} />
          <SettingRow title={t("models.remove")} subtitle={draft.name === settings.default_profile && settings.profiles.length > 1 ? t("models.deleteNotice") : undefined} onPress={busy || (draft.name === settings.default_profile && settings.profiles.length > 1) ? undefined : () => setDeleting(original)} last />
        </SettingsGroup>}
      </>}
    </>}
    <BottomSheet visible={!!choice} title={t(choice === "provider" ? "models.provider" : choice === "mode" ? "models.mode" : "models.thinking")} onClose={() => setChoice(undefined)}>
      {choice && options.map(value => <ChoiceRow key={value} title={value || t("models.auto")} selected={draft?.[choice] === value} onPress={() => { patch(choice === "provider" ? { provider: value, mode: "", thinking_level: "" } : { [choice]: value }); setChoice(undefined); }} />)}
    </BottomSheet>
    <BottomSheet visible={!!deleting} title={t("models.remove")} onClose={() => { if (!busy) setDeleting(undefined); }}>
      <Notice text={t("models.deleteConfirm", { name: deleting?.name ?? "" })} />
      <Notice text={error} error />
      <Action label={t("models.remove")} danger disabled={busy} onPress={() => { if (deleting) void submit("delete", deleting); }} />
    </BottomSheet>
  </SettingsPage>;
}
