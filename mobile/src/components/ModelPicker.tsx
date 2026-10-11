import { useModelFavorites } from "../platform/preferences";
import { useDaemon } from "../platform/context";
import { favoriteKey } from "@zotigo/shared/modelFavorites";
import { compatibleReasoningEffort } from "@zotigo/shared/modelSelection";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentModel } from "@zotigo/shared/zotigod";
import { ChoiceRow } from "./BottomSheet";
import { Action, colors, Notice, styles } from "./ui";

export function ModelPicker({
  models,
  model,
  effort,
  disabled,
  onConfirm,
  confirmLabel = "Use model",
}: {
  models: AgentModel[];
  model: string;
  effort: string;
  disabled: boolean;
  confirmLabel?: string;
  onConfirm: (model: string, effort: string) => void;
}) {
  const client = useDaemon();
  const favorites = useModelFavorites(client.connection.id);
  const [picked, setPicked] = useState(model);
  const [reasoning, setReasoning] = useState(effort);
  useEffect(() => {
    if (!models.some((m) => m.id === picked))
      setPicked(
        models.find((m) => m.id === model)?.id ??
          models.find((m) => m.is_default)?.id ??
          models[0]?.id ??
          "",
      );
  }, [models, model, picked]);
  const selected = models.find((m) => m.id === picked);
  const validEffort = compatibleReasoningEffort(
    selected?.supported_reasoning_efforts ?? [],
    reasoning,
  );
  return (
    <>
      {!models.length && <Notice text="No models available." />}
      <Notice text={favorites.error} error />
      {favorites.items.some((f) => f.agent === "codex") && (
        <Text style={styles.muted}>Favorites</Text>
      )}
      {favorites.items
        .filter(
          (f) =>
            f.agent === "codex" &&
            models.some(
              (m) =>
                m.id === f.model &&
                (m.supported_reasoning_efforts.includes(f.reasoningEffort) ||
                  !m.supported_reasoning_efforts.length),
            ),
        )
        .map(
          (f) =>
            f.agent === "codex" && (
              <ChoiceRow
                key={favoriteKey(f)}
                title={`★ ${f.model}`}
                subtitle={f.reasoningEffort}
                selected={
                  picked === f.model && validEffort === f.reasoningEffort
                }
                disabled={disabled}
                onPress={() => {
                  setPicked(f.model);
                  setReasoning(f.reasoningEffort);
                }}
              />
            ),
        )}
      <Text style={styles.muted}>Models</Text>
      {models.map((m) => (
        <ChoiceRow
          key={m.id}
          title={m.display_name}
          selected={m.id === picked}
          disabled={disabled}
          onPress={() => setPicked(m.id)}
        />
      ))}
      {!!selected?.supported_reasoning_efforts.length && (
        <View style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={styles.muted}>Reasoning effort</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {selected.supported_reasoning_efforts.map((e) => (
              <Pressable
                key={e}
                accessibilityRole="radio"
                aria-checked={e === validEffort}
                accessibilityState={{ checked: e === validEffort, disabled }}
                disabled={disabled}
                onPress={() => setReasoning(e)}
                style={{
                  minHeight: 44,
                  minWidth: 52,
                  padding: 12,
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor:
                    e === validEffort ? colors.elevated : "transparent",
                  borderWidth: 1,
                  borderColor:
                    e === validEffort ? colors.accent : colors.border,
                }}
              >
                <Text
                  style={{
                    color: e === validEffort ? colors.accent : colors.text,
                  }}
                >
                  {e}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Action
        label={confirmLabel}
        disabled={disabled || !selected}
        onPress={() => {
          if (selected) onConfirm(selected.id, validEffort);
        }}
      />
    </>
  );
}
