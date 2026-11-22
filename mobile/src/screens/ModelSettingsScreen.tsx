import { hosts } from "../platform/storage";
import { createDaemon } from "../platform/client";
import { SettingsPage } from "../components/SettingsLayout";
import Plus from "lucide-react-native/icons/plus";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { t } from "@zotigo/shared/i18n/index";
import type { ModelProfile, ModelSettings, ModelSettingsChange } from "@zotigo/shared/modelSettings";
import { DaemonContext, useDaemon } from "../platform/context";
import { useLocale } from "../platform/i18n";
import { ApiError, type Host } from "../core/client";
import { modelDraftError } from "../core/modelSettings";
import { Action, ListGroup, ListRow, Loading, Notice, Section, TextField, colors, radius, space, styles } from "../components/ui";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";

const blank = (): ModelProfile => ({ name: "", provider: "openai", model: "", base_url: "", thinking_level: "", context_window: 0, max_output_tokens: null, mode: "", has_api_key: false });

export function ModelSettingsScreen() {
  const workbenchClient = useDaemon();
  const [client, setClient] = useState(workbenchClient);
  const [list, setList] = useState<Host[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false);
  const lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    void hosts.list().then(value => { if (alive.current) setList(value); }).catch(() => { if (alive.current) setError(t("models.connection")); });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => () => { if (client !== workbenchClient) client.dispose(); }, [client, workbenchClient]);
  async function select(host: Host) {
    if (lock.current || host.id === client.connection.id) return;
    lock.current = true; setSelecting(true); setError("");
    try {
      const connection = await hosts.connection(host);
      if (alive.current) setClient(host.id === workbenchClient.connection.id ? workbenchClient : createDaemon(connection));
    } catch { if (alive.current) setError(t("models.connection")); }
    finally { lock.current = false; if (alive.current) setSelecting(false); }
  }
  return <DaemonContext.Provider value={client}><ModelSettingsContent key={client.connection.id} hostList={list} selecting={selecting} hostError={error} onSelect={host => void select(host)} /></DaemonContext.Provider>;
}

function ModelSettingsContent({ hostList, selecting, hostError, onSelect }: { hostList: Host[]; selecting: boolean; hostError: string; onSelect: (host: Host) => void }) {
  const locale = useLocale();
  const client = useDaemon();
  const [settings, setSettings] = useState<ModelSettings>();
  const [draft, setDraft] = useState<ModelProfile>();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [choosingHost, setChoosingHost] = useState(false);
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
  const closeDraft = () => { setDraft(undefined); setApiKey(""); setClearKey(false); setError(""); setStatus(""); };
  const defaultLocked = draft?.name === settings?.default_profile && (settings?.profiles.length ?? 0) > 1;
  return <SettingsPage>
    {!draft && <Section footer={t("models.codex")}>
      <ListGroup><ListRow title={t("settings.targetHost")} value={client.connection.name} disabled={busy || selecting} onPress={() => setChoosingHost(true)} /></ListGroup>
      <Notice text={hostError} error />
    </Section>}
    <BottomSheet visible={choosingHost} title={t("settings.targetHost")} onClose={() => setChoosingHost(false)}>
      {hostList.map(host => <ChoiceRow key={host.id} title={host.name} selected={client.connection.id === host.id} disabled={selecting} onPress={() => { setChoosingHost(false); onSelect(host); }} />)}
    </BottomSheet>
    {draft && <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text accessibilityRole="header" style={styles.title}>{editing ? draft.name : t("models.add")}</Text>
      <Action secondary label={t("models.cancel")} disabled={busy} onPress={closeDraft} />
    </View>}
    {loading && <Loading />}
    {!!error && <View><Notice text={error} error /><Action label={t("models.reload")} disabled={busy || loading} onPress={() => setReload(value => value + 1)} /></View>}
    {!!status && <Notice text={status} />}
    {settings && !loading && <>
      {!draft && <Section title={t("mobileUi.modelProfiles")} footer={t("models.help")}>
        <ListGroup>
          {settings.profiles.map(profile => <ListRow key={profile.name} title={profile.name} subtitle={`${profile.provider} · ${profile.model}`} value={profile.name === settings.default_profile ? t("models.default") : undefined} disabled={busy} onPress={() => open(profile)} />)}
          <ListRow icon={Plus} title={t("models.add")} chevron={false} disabled={busy} onPress={() => open()} />
        </ListGroup>
        {!settings.profiles.length && <Notice text={t("models.empty")} />}
      </Section>}
      {draft && <>
        <View style={form}>
          <TextField label={t("models.name")} value={draft.name} editable={!busy && !editing} maxLength={64} onChangeText={name => patch({ name })} help={editing ? undefined : t("models.nameHelp")} />
          <View style={inset}><ListRow title={t("models.provider")} value={draft.provider} disabled={busy} onPress={() => setChoice("provider")} /></View>
          <TextField label={t("models.model")} value={draft.model} editable={!busy} maxLength={256} onChangeText={model => patch({ model })} />
          <TextField label={t("models.url")} value={draft.base_url} editable={!busy} keyboardType="url" onChangeText={base_url => patch({ base_url })} />
          <TextField label={t("models.key")} secureTextEntry value={apiKey} editable={!busy && !clearKey} placeholder={t(draft.has_api_key ? "models.keySet" : "models.keyEmpty")} onChangeText={value => { setApiKey(value); setStatus(""); }} />
          {draft.has_api_key && <ChoiceRow title={t("models.clearKey")} selected={clearKey} disabled={busy} onPress={() => { setClearKey(!clearKey); setApiKey(""); }} />}
        </View>
        <ListGroup>
          <ListRow title={t("models.advanced")} expanded={advanced} onPress={() => setAdvanced(!advanced)} />
          {advanced && <View style={{ padding: space.lg, gap: space.lg }}>
            <View style={inset}><ListRow title={t("models.thinking")} value={draft.thinking_level || t("models.auto")} disabled={busy} onPress={() => setChoice("thinking_level")} /></View>
            <TextField label={t("models.window")} keyboardType="number-pad" value={draft.context_window ? String(draft.context_window) : ""} editable={!busy} placeholder={tokens(settings.defaults?.context_window)} onChangeText={value => patch({ context_window: value === "" ? 0 : Number(value) })} help={t("models.windowHelp", { tokens: tokens(settings.defaults?.context_window) })} />
            <TextField label={t("models.output")} keyboardType="number-pad" value={draft.max_output_tokens === null ? "" : String(draft.max_output_tokens)} editable={!busy} placeholder={tokens(saved?.default_max_output_tokens ?? settings.defaults?.max_output_tokens)} onChangeText={value => patch({ max_output_tokens: value === "" ? null : Number(value) })} help={t("models.outputHelp", { tokens: tokens(saved?.default_max_output_tokens ?? settings.defaults?.max_output_tokens) })} />
            {draft.provider === "openai" && <><Text style={styles.muted}>{t("models.openaiOutputHelp")}</Text><View style={inset}><ListRow title={t("models.mode")} value={draft.mode || t("models.auto")} disabled={busy} onPress={() => setChoice("mode")} /></View></>}
          </View>}
        </ListGroup>
        <View style={{ gap: space.sm }}>
          <Action primary block label={busy ? t("app.saving") : t("models.save")} disabled={busy} onPress={() => void submit("save", draft)} />
          <Action block label={t("models.test")} disabled={busy} onPress={() => void submit("save", draft, true)} />
          <Text style={styles.muted}>{t("models.testHelp")}</Text>
        </View>
        {editing && <Section footer={defaultLocked ? t("models.deleteNotice") : undefined}>
          <ListGroup>
            <ListRow title={draft.name === settings.default_profile ? t("models.default") : t("models.makeDefault")} chevron={false} disabled={busy || draft.name === settings.default_profile} onPress={() => { if (original) void submit("default", original); }} />
            <ListRow danger title={t("models.remove")} disabled={busy || defaultLocked} onPress={() => setDeleting(original)} />
          </ListGroup>
        </Section>}
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

const form = { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.lg };
// A picker row inside a padded form card lines up with the fields around it.
const inset = { marginHorizontal: -space.lg };
