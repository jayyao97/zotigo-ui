import { t } from "@zotigo/shared/i18n/index";
import {
  approvalPolicyDescription,
  approvalPolicyLabel,
} from "@zotigo/shared/approvalPolicy";
import type { ApprovalPolicy } from "@zotigo/shared/zotigod";
import type { ReactNode, RefObject } from "react";
import { Alert, View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import { useLocale } from "../platform/i18n";
import { ChoiceRow } from "./BottomSheet";
import { Chip, IconButton, Notice, colors, radius } from "./ui";

/**
 * The one composer frame used by new and existing conversations: input on top,
 * then attach · access · (spacer) · model · trailing (context, send/stop).
 * Settings are labeled chips so their current value is always visible.
 */
export function ComposerFrame({
  anchorRef,
  input,
  policy,
  modelLabel,
  disabled,
  onAttach,
  onPolicy,
  onModel,
  trailing,
}: {
  anchorRef?: RefObject<View | null>;
  input: ReactNode;
  policy?: ApprovalPolicy;
  modelLabel: string;
  disabled?: { attach?: boolean; policy?: boolean; model?: boolean };
  onAttach: () => void;
  onPolicy: () => void;
  onModel: () => void;
  trailing: ReactNode;
}) {
  useLocale();
  const full = policy === "bypass_permissions";
  const accessLabel = approvalPolicyLabel(policy ?? "auto");
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>{input}</View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <IconButton
          icon={Plus}
          label={t("mobileUi.attach")}
          disabled={disabled?.attach}
          onPress={onAttach}
        />
        <Chip
          fixed
          icon={full ? ShieldAlert : ShieldCheck}
          tone={full ? "warning" : "default"}
          label={accessLabel}
          accessibilityLabel={`${t("channelsPage.permissions")}: ${accessLabel}`}
          disabled={disabled?.policy}
          onPress={onPolicy}
        />
        <View style={{ flex: 1 }} />
        <Chip
          label={modelLabel}
          accessibilityLabel={`${t("mobile.modelAndReasoning")}: ${modelLabel}`}
          disabled={disabled?.model}
          onPress={onModel}
        />
        {trailing}
      </View>
    </View>
  );
}

/** Access policy choices. Full access always asks for confirmation first. */
export function PolicyChoices({
  value,
  disabled,
  approvalsUnsupported,
  onChange,
}: {
  value?: ApprovalPolicy;
  disabled?: boolean;
  approvalsUnsupported?: boolean;
  onChange: (policy: ApprovalPolicy) => void;
}) {
  useLocale();
  return (
    <>
      {approvalsUnsupported && (
        <Notice text={t("mobile.thisRuntimeDoesNotSupportApprovalRequestsExplicitlyEnableBypassApprovalsToCreateASession")} />
      )}
      <ChoiceRow
        icon={ShieldCheck}
        title={approvalPolicyLabel("auto")}
        subtitle={approvalPolicyDescription("auto")}
        selected={value === "auto"}
        disabled={disabled || approvalsUnsupported}
        onPress={() => onChange("auto")}
      />
      <ChoiceRow
        icon={ShieldAlert}
        title={approvalPolicyLabel("bypass_permissions")}
        subtitle={approvalPolicyDescription("bypass_permissions")}
        selected={value === "bypass_permissions"}
        disabled={disabled}
        onPress={() =>
          value === "bypass_permissions"
            ? onChange("bypass_permissions")
            : Alert.alert(
                t("mobile.bypassApprovals"),
                t("mobile.toolsCanRunWithoutAskingYouForApproval"),
                [
                  { text: t("app.cancel"), style: "cancel" },
                  {
                    text: t("mobile.enable"),
                    style: "destructive",
                    onPress: () => onChange("bypass_permissions"),
                  },
                ],
              )
        }
      />
    </>
  );
}
