import { useState } from "react";
import { Alert, Text, View } from "react-native";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import {
  buildInteractionAnswers,
  interactionAnswersComplete,
  type InteractionDrafts,
} from "@zotigo/shared/interactionAnswers";
import type { DaemonClient } from "../core/client";
import { Action, Notice, styles, TextField } from "./ui";
export function HumanRequest({
  item,
  client,
  id,
  run,
  disabled,
}: {
  item: DisplayItem;
  client: DaemonClient;
  id: string;
  run: (action: () => Promise<unknown>) => void;
  disabled: boolean;
}) {
  const [answers, setAnswers] = useState<InteractionDrafts>({});
  const approval = item.approval,
    interaction = item.interaction;
  function submit() {
    if (interaction)
      run(() =>
        client.interaction(
          id,
          interaction.id,
          buildInteractionAnswers(interaction.questions ?? [], answers),
        ),
      );
  }
  return (
    <View
      style={{
        padding: 16,
        gap: 10,
        borderRadius: 16,
        backgroundColor: "#282828",
      }}
    >
      {approval?.id && (
        <>
          <Text style={styles.text}>Approval needed</Text>
          {approval.pending?.map((p) => (
            <View key={p.tool_call_id}>
              <Text style={styles.text}>{p.description ?? p.tool_name}</Text>
              <Text selectable style={styles.muted}>
                {p.arguments}
              </Text>
              <Notice
                text={[p.risk_level, p.reason].filter(Boolean).join(" · ")}
              />
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[true, false].map((approved) => (
              <Action
                key={String(approved)}
                label={approved ? "Approve all" : "Deny all"}
                disabled={disabled || !approval.pending?.length}
                danger={!approved}
                onPress={() =>
                  run(() =>
                    client.approval(
                      id,
                      approval.id!,
                      approval.pending!.map((p) => ({
                        tool_call_id: p.tool_call_id,
                        approved,
                      })),
                    ),
                  )
                }
              />
            ))}
          </View>
        </>
      )}
      {interaction && (
        <>
          <Text style={styles.text}>
            {interaction.is_blocking === false
              ? "Question"
              : "Your answer is needed"}
          </Text>
          {interaction.questions?.map((q) => (
            <View key={q.id} style={{ gap: 8 }}>
              <Text style={styles.text}>{q.question}</Text>
              {q.options?.map((o) => (
                <Action
                  key={o.label}
                  secondary
                  disabled={disabled}
                  label={`${answers[q.id]?.selected === o.label ? "Selected: " : ""}${o.label}${o.description ? " — " + o.description : ""}`}
                  onPress={() =>
                    setAnswers((x) => ({
                      ...x,
                      [q.id]: {
                        ...x[q.id],
                        selected: o.label,
                        otherSelected: false,
                      },
                    }))
                  }
                />
              ))}
              {!!q.options?.length && (
                <Action
                  label="None of the above"
                  disabled={disabled}
                  secondary
                  onPress={() =>
                    setAnswers((x) => ({
                      ...x,
                      [q.id]: {
                        ...x[q.id],
                        selected: undefined,
                        otherSelected: true,
                      },
                    }))
                  }
                />
              )}
              <TextField
                label={
                  q.options?.length ? "Additional note" : (q.header ?? "Answer")
                }
                value={answers[q.id]?.value ?? ""}
                secureTextEntry={q.is_secret}
                onChangeText={(value) =>
                  setAnswers((x) => ({ ...x, [q.id]: { ...x[q.id], value } }))
                }
              />
            </View>
          ))}
          <Action
            label="Submit answers"
            disabled={
              disabled ||
              !interactionAnswersComplete(interaction.questions ?? [], answers)
            }
            onPress={submit}
          />
          <Action
            label="Submit partial answers"
            disabled={disabled}
            secondary
            onPress={() =>
              Alert.alert(
                "Submit with unanswered questions?",
                "The agent will receive the answers provided so far.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Submit", onPress: submit },
                ],
              )
            }
          />
        </>
      )}
    </View>
  );
}
