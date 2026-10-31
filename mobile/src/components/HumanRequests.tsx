import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
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
  useLocale();
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
          <Text style={styles.text}>{t("conversationTimeline.approvalRequired")}</Text>
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
              label={t("conversationTimeline.reasonForDenyingOptional")}
              value={denyReason}
              onChangeText={setDenyReason}
              editable={!disabled}
            />
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Action
              label={denying ? t("conversationTimeline.confirmDeny") : t("conversationTimeline.deny")}
              disabled={disabled || !approval.pending?.length}
              danger
              onPress={() => (denying ? decide(false) : setDenying(true))}
            />
            <Action
              label={t("conversationTimeline.approve")}
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
              ? t("conversationTimeline.asks", {p0: interaction.requester.name})
              : t("conversationTimeline.inputRequired")}
          </Text>
          <Notice text={interaction.is_blocking ? t("interaction.waitingForAnswer") : t("interaction.answerWhileWorking")} />
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
                  title={t("conversationTimeline.noneOfTheAbove")}
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
                      ? t("conversationTimeline.addAnOptionalNote")
                      : t("conversationTimeline.typeYourAnswer")
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
            <Notice text={t("conversationTimeline.someQuestionsAreUnansweredSubmitAnyway")} />
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {confirmUnanswered && (
              <Action
                label={t("app.cancel")}
                secondary
                disabled={disabled}
                onPress={() => setConfirmUnanswered(false)}
              />
            )}
            <Action
              label={confirmUnanswered ? t("conversationTimeline.submitAnyway") : t("conversationTimeline.submitAnswer")}
              disabled={disabled}
              onPress={submit}
            />
          </View>
        </>
      )}
    </View>
  );
}
