import { t } from "@zotigo/shared/i18n/index";
import { stateLabel } from "@zotigo/shared/i18n/display";
import type { ZotigoSession } from "@zotigo/shared/zotigod";
import { Alert, Platform, Text, TextInput, View } from "react-native";
import Pin from "lucide-react-native/icons/pin";
import PinOff from "lucide-react-native/icons/pin-off";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Bell from "lucide-react-native/icons/bell";
import GitBranch from "lucide-react-native/icons/git-branch";
import Mail from "lucide-react-native/icons/mail";
import MailOpen from "lucide-react-native/icons/mail-open";
import Play from "lucide-react-native/icons/play";
import Archive from "lucide-react-native/icons/archive";
import { useLocale } from "../platform/i18n";
import { Action, ListGroup, ListRow, Section, colors, space, styles, type } from "./ui";
import { CopyIdRow } from "./CopyIdRow";

/**
 * Body of the conversation "…" sheet: rename, quick actions, read-only
 * details, and the destructive action last and separated.
 * The screen owns all state and requests; this only lays them out.
 */
export function ConversationActions({
  id,
  session,
  title,
  savedTitle,
  onTitle,
  pinned,
  busy,
  forkDisabled,
  contextPercent,
  onRename,
  onTogglePin,
  onFiles,
  onNotifications,
  onContext,
  onFork,
  onReadState,
  onResume,
  onArchive,
}: {
  id: string;
  session?: ZotigoSession;
  title: string;
  savedTitle: string;
  onTitle: (title: string) => void;
  pinned: boolean | null;
  busy: boolean;
  forkDisabled: boolean;
  contextPercent: number;
  onRename: () => void;
  onTogglePin: () => void;
  onFiles: () => void;
  onNotifications: () => void;
  onContext: () => void;
  onFork: () => void;
  onReadState: () => void;
  onResume: () => void;
  onArchive: () => void;
}) {
  useLocale();
  const unread = session?.read_state?.unread;
  const dirty = !!title.trim() && title.trim() !== savedTitle;
  return (
    <View style={{ gap: space.lg }}>
      <Section title={t("mobileUi.renameTitle")}>
        <ListGroup>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingLeft: space.lg, paddingRight: space.xs }}>
            <TextInput
              accessibilityLabel={t("mobileUi.renameTitle")}
              value={title}
              onChangeText={onTitle}
              returnKeyType="done"
              onSubmitEditing={onRename}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.faint}
              style={{ flex: 1, color: colors.text, ...type.body, paddingVertical: space.md }}
            />
            {dirty && (
              // Action pins itself to flex-start; the wrapper lets the row center it vertically.
              <View>
                <Action secondary label={t("app.save")} disabled={busy} onPress={onRename} />
              </View>
            )}
          </View>
        </ListGroup>
      </Section>
      <ListGroup>
        <ListRow
          icon={pinned ? PinOff : Pin}
          title={pinned ? t("app.unpin") : t("app.pin")}
          chevron={false}
          disabled={busy || pinned === null}
          onPress={onTogglePin}
        />
        <ListRow icon={FolderOpen} title={t("app.browseFiles")} disabled={busy} onPress={onFiles} />
        <ListRow icon={Bell} title={t("app.notifications")} onPress={onNotifications} />
        <ListRow
          icon={GitBranch}
          title={t("mobileUi.fork")}
          chevron={false}
          disabled={busy || forkDisabled}
          onPress={onFork}
        />
        {session?.read_state && (
          <ListRow
            icon={unread ? MailOpen : Mail}
            title={unread ? t("app.markAsRead") : t("app.markAsUnread")}
            chevron={false}
            disabled={busy}
            onPress={onReadState}
          />
        )}
        {session && !session.live && (
          <ListRow icon={Play} title={t("mobile.resumeRuntime")} chevron={false} disabled={busy} onPress={onResume} />
        )}
      </ListGroup>
      <Section title={t("mobileUi.details")}>
        <ListGroup>
          <ListRow title={t("app.state")} value={session ? stateLabel(session.state) : "—"} />
          {session?.context_usage ? (
            <ListRow
              title={t("mobileUi.context")}
              value={t("context.percentUsed", { percent: contextPercent })}
              onPress={onContext}
            />
          ) : null}
          {session?.working_directory ? (
            <Detail label={t("mobileUi.directory")} value={session.working_directory} />
          ) : null}
          <Detail label={t("mobileUi.sessionId")} value={id} />
          <CopyIdRow title={t("app.copySessionId")} id={id} />
        </ListGroup>
      </Section>
      <ListGroup>
        <ListRow
          icon={Archive}
          danger
          title={t("app.archive")}
          disabled={busy}
          onPress={() =>
            Alert.alert(
              t("mobileUi.archiveTitle"),
              t("mobile.thisHidesTheSessionFromActiveListsHistoryIsRetained"),
              [
                { text: t("app.cancel"), style: "cancel" },
                { text: t("app.archive"), style: "destructive", onPress: onArchive },
              ],
            )
          }
        />
      </ListGroup>
    </View>
  );
}

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: 10, gap: 2 }}>
      <Text style={{ color: colors.text, ...type.body }}>{label}</Text>
      {/* Paths and IDs wrap fully instead of being clipped by the row. */}
      <Text selectable style={[styles.muted, { fontFamily: mono, fontSize: 12 }]}>{value}</Text>
    </View>
  );
}
