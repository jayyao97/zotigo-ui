import { stateLabel } from "@zotigo/shared/i18n/display";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { AgentCatalogEntry, AgentKind, ProfilesResponse } from "@zotigo/shared/zotigod";
import { favoriteKey, type ModelFavorite } from "@zotigo/shared/modelFavorites";
import { compatibleReasoningEffort } from "@zotigo/shared/modelSelection";
import {
  availableModelChoice,
  defaultModelChoice,
  type PickerAgent,
} from "../core/modelPicker";
import { useDaemon } from "../platform/context";
import { useModelFavorites } from "../platform/preferences";
import { ChoiceRow } from "./BottomSheet";
import { Action, colors, Loading, Notice, styles } from "./ui";

export function RuntimePicker({
  agents,
  unavailableAgents = [],
  profiles,
  value,
  fixedAgent,
  disabled,
  onConfirm,
  confirmLabel,
  profilesLoading = false,
  onConfigureModels,
}: {
  agents: PickerAgent[];
  unavailableAgents?: AgentCatalogEntry[];
  profilesLoading?: boolean;
  onConfigureModels?: () => void;
  profiles?: ProfilesResponse;
  value: ModelFavorite;
  fixedAgent?: AgentKind;
  disabled: boolean;
  onConfirm: (value: ModelFavorite) => void;
  confirmLabel?: string;
}) {
  useLocale();
  const client = useDaemon();
  const favorites = useModelFavorites(client.connection.id);
  const [tab, setTab] = useState<"favorites" | AgentKind>(
    favorites.items.length ? "favorites" : value.agent,
  );
  const [picked, setPicked] = useState(value);
  const { height } = useWindowDimensions();
  const models = agents.find((a) => a.id === "codex")?.models ?? [];
  const model = models.find(
    (m) => picked.agent === "codex" && m.id === picked.model,
  );
  const valid = (choice: ModelFavorite) =>
    availableModelChoice(choice, agents, profiles, fixedAgent);
  useEffect(() => {
    // Data can arrive after opening the sheet. Only initialize an empty selection.
    if (
      (picked.agent === "codex" && !picked.model) ||
      (picked.agent === "zotigo" && !picked.profile)
    ) {
      const next = defaultModelChoice(picked.agent, agents, profiles);
      if (availableModelChoice(next, agents, profiles, fixedAgent))
        setPicked(next);
    }
  }, [agents, profiles, picked, fixedAgent]);
  const saved = favorites.items.filter(valid);
  const tabChosen = useRef(false);
  useEffect(() => {
    if (!tabChosen.current && favorites.ready && saved.length) {
      setTab("favorites");
      tabChosen.current = true;
    }
  }, [favorites.ready, saved.length]);
  function selectTab(next: typeof tab) {
    tabChosen.current = true;
    setTab(next);
    if (next === "favorites" || next === picked.agent) return;
    setPicked(defaultModelChoice(next, agents, profiles));
  }
  const tabs = [
    "favorites" as const,
    ...agents
      .filter((a) => !fixedAgent || a.id === fixedAgent)
      .map((a) => a.id),
  ];
  return (
    <View style={{ height: Math.min(420, height * 0.55), flexShrink: 1, gap: 10 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          backgroundColor: colors.background,
          padding: 3,
          borderRadius: 12,
        }}
      >
        {tabs.map((tabValue) => (
          <Pressable
            key={tabValue}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === tabValue }}
            disabled={disabled}
            onPress={() => selectTab(tabValue)}
            style={{
              flex: 1,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 10,
              backgroundColor: tab === tabValue ? colors.selected : "transparent",
            }}
          >
            <Text style={styles.text}>
              {tabValue === "favorites"
                ? t("conversationComposer.favorites")
                : agents.find((a) => a.id === tabValue)?.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 4 }}
      >
        <Notice text={favorites.error} error />
        {unavailableAgents.map(agent => <Notice key={agent.id} text={`${agent.label}: ${agent.reason ?? t("favoriteModelSettings.codexUnavailable")}`} error />)}
        {tab === "favorites" && (
          <>
            {!saved.length && (
              <Notice text={t("mobile.noAvailableFavoritesManageFavoritesInSettingsModelsAndFavorites")} />
            )}
            {saved.map((f) => (
              <ChoiceRow
                key={favoriteKey(f)}
                title={f.agent === "codex" ? f.model : f.profile}
                subtitle={
                  f.agent === "codex"
                    ? `Codex · ${f.reasoningEffort}`
                    : `Zotigo · ${profiles?.profiles.find((p) => p.name === f.profile)?.model}`
                }
                selected={favoriteKey(f) === favoriteKey(picked)}
                disabled={disabled}
                onPress={() => setPicked(f)}
              />
            ))}
          </>
        )}
        {tab === "codex" && (
          <>
            {!models.length && <Notice text={t("mobile.noModelsAvailable")} />}
            {models.map((m) => (
              <ChoiceRow
                key={m.id}
                title={m.display_name}
                selected={picked.agent === "codex" && picked.model === m.id}
                disabled={disabled}
                onPress={() =>
                  setPicked({
                    agent: "codex",
                    model: m.id,
                    reasoningEffort: compatibleReasoningEffort(
                      m.supported_reasoning_efforts,
                      picked.agent === "codex"
                        ? picked.reasoningEffort
                        : "medium",
                    ),
                  })
                }
              />
            ))}
          </>
        )}
        {tab === "zotigo" && (
          <>
            {onConfigureModels && <Action secondary label={t("models.title")} onPress={onConfigureModels} />}
            {profilesLoading && <Loading />}
            {profiles?.profiles.length === 0 && (
              <Notice text={t("mobile.noProfilesConfigured")} />
            )}
            {profiles?.profiles.map((p) => (
              <ChoiceRow
                key={p.name}
                title={p.name}
                subtitle={[
                  p.model,
                  p.thinking_level &&
                    (p.thinking_level === "disabled"
                      ? t("mobile.thinkingOff")
                      : stateLabel(p.thinking_level)),
                  p.name === profiles.default_profile && t("mobile.default"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                selected={
                  picked.agent === "zotigo" && picked.profile === p.name
                }
                disabled={disabled}
                onPress={() => setPicked({ agent: "zotigo", profile: p.name })}
              />
            ))}
          </>
        )}
      {tab === "codex" &&
        picked.agent === "codex" &&
        !!model?.supported_reasoning_efforts.length && (
          <View style={{ gap: 4 }}>
            <Text style={styles.muted}>{t("mobile.reasoningEffort")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {model.supported_reasoning_efforts.map((e) => (
                <Pressable
                  key={stateLabel(e)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: picked.reasoningEffort === e,
                    disabled,
                  }}
                  disabled={disabled}
                  onPress={() => setPicked({ ...picked, reasoningEffort: e })}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    borderRadius: 10,
                    backgroundColor:
                      picked.reasoningEffort === e
                        ? colors.selected
                        : colors.background,
                  }}
                >
                  <Text
                    style={{
                      color:
                        picked.reasoningEffort === e
                          ? colors.accent
                          : colors.text,
                    }}
                  >
                    {stateLabel(e)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || !valid(picked)}
        accessibilityState={{ disabled: disabled || !valid(picked) }}
        onPress={() => onConfirm(picked)}
        style={{
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          padding: 10,
          borderRadius: 14,
          backgroundColor: colors.text,
          opacity: disabled || !valid(picked) ? 0.4 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.background, fontWeight: "500" }}
        >
          {confirmLabel ??
            t("mobile.useValue", {p0: picked.agent === "codex" ? picked.model : picked.profile})}
        </Text>
      </Pressable>
    </View>
  );
}
