import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  matchingSkills,
  editorSkillTokens,
  insertSkillCommand,
  skillCommandQuery,
} from "@zotigo/shared/skillCommands";
import type { SkillSummary } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { Action, colors, errorText, Notice, styles } from "./ui";

export function ComposerSkills({
  text,
  caret = text.length,
  selected,
  sessionId,
  disabled,
  onChange,
}: {
  text: string;
  caret?: number;
  selected: string[];
  sessionId?: string;
  disabled: boolean;
  onChange: (text: string, skills: string[]) => void;
}) {
  useLocale();
  const client = useDaemon();
  const command = skillCommandQuery(text.slice(0, caret));
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
    (skill) =>
      skill.enabled &&
      !editorSkillTokens(text, selected).some(
        (token) => token.name === skill.name,
      ),
  );
  return (
    <View style={{ gap: 4 }}>
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
            <Text style={styles.muted}>{t("conversationComposer.skills")}</Text>
            <Action
              label={t("app.dismiss")}
              secondary
              onPress={() => setDismissed(true)}
            />
          </View>
          {error ? (
            <>
              <Notice text={error} error />
              <Action
                label={t("mobile.retrySkills")}
                onPress={() => setRetry((value) => value + 1)}
              />
            </>
          ) : !skills ? (
            <Notice text={t("conversationComposer.loadingSkills")} />
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={matches}
              keyExtractor={(skill) => skill.name}
              ListEmptyComponent={<Notice text={t("conversationComposer.noMatchingSkills")} />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("mobile.selectSkillValue", {p0: item.name})}
                  onPress={() => {
                    if (command)
                      onChange(
                        insertSkillCommand(text, command, caret, item.name),
                        [...new Set([...selected, item.name])],
                      );
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
