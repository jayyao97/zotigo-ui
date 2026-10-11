import { useState } from "react";
import { Text, View } from "react-native";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import {
  buildInteractionAnswers,
  interactionAnswersComplete,
  type InteractionDrafts,
} from "@zotigo/shared/interactionAnswers";
import type { DaemonClient } from "../core/client";
import { ChoiceRow } from "./BottomSheet";
import { Action, colors, Notice, styles, TextField } from "./ui";
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
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [denying, setDenying] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const approval = item.approval,
    interaction = item.interaction;
  function decide(approved: boolean) {
    if (!approval?.id) return;
    run(() =>
      client.approval(
        id,
        approval.id!,
        (approval.pending ?? []).map((p) => ({
          tool_call_id: p.tool_call_id,
          approved,
          ...(!approved && denyReason.trim()
            ? { reason: denyReason.trim() }
            : {}),
        })),
      ),
    );
  }
  function submit() {
    if (!interaction) return;
    if (
      !interactionAnswersComplete(interaction.questions ?? [], answers) &&
      !confirmUnanswered
    ) {
      setConfirmUnanswered(true);
      return;
    }
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
        backgroundColor: colors.elevated,
      }}
    >
      {approval?.id && (
        <>
          <Text style={styles.text}>Approval required</Text>
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
          {denying && (
            <TextField
              label="Reason for denying (optional)"
              value={denyReason}
              onChangeText={setDenyReason}
              editable={!disabled}
            />
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Action
              label={denying ? "Confirm deny" : "Deny"}
              disabled={disabled || !approval.pending?.length}
              danger
              onPress={() => (denying ? decide(false) : setDenying(true))}
            />
            <Action
              label="Approve"
              disabled={disabled || !approval.pending?.length}
              onPress={() => decide(true)}
            />
          </View>
        </>
      )}
      {interaction && (
        <>
          <Text style={styles.text}>
            {interaction.requester?.name
              ? `${interaction.requester.name} asks`
              : "Input required"}
          </Text>
          {interaction.questions?.map((q) => (
            <View key={q.id} style={{ gap: 8 }}>
              {q.header && <Text style={styles.muted}>{q.header}</Text>}
              <Text style={styles.text}>{q.question}</Text>
              {q.options?.map((o) => (
                <ChoiceRow
                  key={o.label}
                  title={o.label}
                  subtitle={o.description}
                  disabled={disabled}
                  selected={
                    !answers[q.id]?.otherSelected &&
                    answers[q.id]?.selected === o.label
                  }
                  onPress={() => {
                    setConfirmUnanswered(false);
                    setAnswers((x) => ({
                      ...x,
                      [q.id]: {
                        ...x[q.id],
                        selected: o.label,
                        otherSelected: false,
                      },
                    }));
                  }}
                />
              ))}
              {q.is_other && !!q.options?.length && (
                <ChoiceRow
                  title="None of the above"
                  disabled={disabled}
                  selected={answers[q.id]?.otherSelected === true}
                  onPress={() => {
                    setConfirmUnanswered(false);
                    setAnswers((x) => ({
                      ...x,
                      [q.id]: {
                        ...x[q.id],
                        selected: undefined,
                        otherSelected: true,
                      },
                    }));
                  }}
                />
              )}
              {(!q.options?.length ||
                answers[q.id]?.selected ||
                answers[q.id]?.otherSelected) && (
                <TextField
                  label={
                    q.options?.length
                      ? "Add an optional note"
                      : "Type your answer"
                  }
                  value={answers[q.id]?.value ?? ""}
                  secureTextEntry={q.is_secret}
                  editable={!disabled}
                  onChangeText={(value) => {
                    setConfirmUnanswered(false);
                    setAnswers((x) => ({
                      ...x,
                      [q.id]: { ...x[q.id], value },
                    }));
                  }}
                />
              )}
            </View>
          ))}
          {confirmUnanswered && (
            <Notice text="Some questions are unanswered. Submit anyway?" />
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {confirmUnanswered && (
              <Action
                label="Cancel"
                secondary
                disabled={disabled}
                onPress={() => setConfirmUnanswered(false)}
              />
            )}
            <Action
              label={confirmUnanswered ? "Submit anyway" : "Submit answer"}
              disabled={disabled}
              onPress={submit}
            />
          </View>
        </>
      )}
    </View>
  );
}
