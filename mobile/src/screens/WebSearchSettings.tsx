import { Fragment, useState } from "react";
import { Switch } from "react-native";
import { t } from "@zotigo/shared/i18n/index";
import { searchProviders, type SearchSettings, type SearchSettingsChange } from "@zotigo/shared/modelSettings";
import { Section, ListGroup, ListRow, TextField, Action } from "../components/ui";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";

type Draft = SearchSettingsChange["web_search"];

export function WebSearchSettings({ settings, busy, save }: { settings: SearchSettings; busy: boolean; save: (change: Draft) => Promise<SearchSettings | undefined> }) {
  const [draft, setDraft] = useState<Draft>({ provider: settings.provider });
  const [choosing, setChoosing] = useState(false);
  const changed = draft.provider !== settings.provider || draft.deepseek_key !== undefined || draft.tavily_key !== undefined;
  const label = (id: string) => id === "" ? t("models.searchDefault") : id === "deepseek" ? t("models.deepseek") : t("models.tavily");

  return <Section title={t("models.search")}>
    <ListGroup><ListRow title={t("models.searchProvider")} value={label(draft.provider)} onPress={() => setChoosing(true)} disabled={busy} /></ListGroup>
    <BottomSheet visible={choosing} title={t("models.searchProvider")} onClose={() => setChoosing(false)}>
      {["", ...searchProviders].map(id => <ChoiceRow key={id} title={label(id)} selected={draft.provider === id}
        onPress={() => { setDraft({ ...draft, provider: id }); setChoosing(false); }} />)}
    </BottomSheet>
    {searchProviders.map(id => {
      const field = `${id}_key` as const;
      const provider = t(`models.${id}`);
      const hasKey = settings[`has_${id}_key`];
      const clear = draft[field] === "";
      const clearLabel = t("models.clearSearchKey", { provider });
      return <Fragment key={id}>
        <TextField label={t("models.searchKey", { provider })} secureTextEntry editable={!busy && !clear} value={draft[field] ?? ""}
          placeholder={t(hasKey ? "models.keySet" : "models.keyEmpty")} onChangeText={value => setDraft({ ...draft, [field]: value || undefined })} />
        {hasKey && <ListRow title={clearLabel} right={<Switch accessibilityLabel={clearLabel} disabled={busy} value={clear}
          onValueChange={checked => setDraft({ ...draft, [field]: checked ? "" : undefined })} />} />}
      </Fragment>;
    })}
    <Action label={t("models.save")} disabled={busy || !changed} onPress={async () => {
      const saved = await save(draft);
      if (saved) setDraft({ provider: saved.provider });
    }} />
  </Section>;
}
