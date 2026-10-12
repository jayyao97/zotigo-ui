import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  matchingSkills,
  skillCommandQuery,
} from "@zotigo/shared/skillCommands";
import type { SkillSummary } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { Action, colors, errorText, Notice, styles } from "./ui";

export function ComposerSkills({
  text,
  selected,
  sessionId,
  disabled,
  onChange,
}: {
  text: string;
  selected: string[];
  sessionId?: string;
  disabled: boolean;
  onChange: (text: string, skills: string[]) => void;
}) {
  const client = useDaemon();
  const command = skillCommandQuery(text);
  const [skills, setSkills] = useState<SkillSummary[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [text]);
  const open = command !== null && !dismissed && !disabled;
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setSkills(undefined);
    void client
      .skills(sessionId)
      .then((value) => {
        if (active) setSkills(value.skills);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [client, sessionId, open, retry]);
  const matches = matchingSkills(skills ?? [], command?.query ?? "").filter(
    (skill) => skill.enabled && !selected.includes(skill.name),
  );
  return (
    <View style={{ gap: 4 }}>
      {!!selected.length && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {selected.map((name) => (
            <Action
              key={name}
              label={`${name} ×`}
              disabled={disabled}
              onPress={() =>
                onChange(
                  text,
                  selected.filter((item) => item !== name),
                )
              }
            />
          ))}
        </View>
      )}
      {open && (
        <View
          style={{
            maxHeight: 220,
            borderRadius: 16,
            backgroundColor: colors.surface,
            padding: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={styles.muted}>Skills</Text>
            <Action
              label="Dismiss"
              secondary
              onPress={() => setDismissed(true)}
            />
          </View>
          {error ? (
            <>
              <Notice text={error} error />
              <Action
                label="Retry skills"
                onPress={() => setRetry((value) => value + 1)}
              />
            </>
          ) : !skills ? (
            <Notice text="Loading skills…" />
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={matches}
              keyExtractor={(skill) => skill.name}
              ListEmptyComponent={<Notice text="No matching skills" />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select skill ${item.name}`}
                  onPress={() => {
                    if (command)
                      onChange(text.slice(0, command.start), [
                        ...selected,
                        item.name,
                      ]);
                  }}
                  style={{ minHeight: 52, padding: 8 }}
                >
                  <Text numberOfLines={1} style={styles.text}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={2} style={styles.muted}>
                    {item.description}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}
