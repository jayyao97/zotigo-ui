import type { RepositoryBranch } from "@zotigo/shared/clientTypes";
import { t } from "@zotigo/shared/i18n/index";
import type {
  CatalogSource,
  CatalogWorkspaceSourceInput,
  FolderSourceMode,
} from "@zotigo/shared/zotigod";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { ChoiceRow } from "../../components/BottomSheet";
import { ListRow, Notice, TextField, colors, radius, space, type } from "../../components/ui";
import { pathLabel } from "../../core/catalog";
import { useDaemon } from "../../platform/context";
import { useLocale } from "../../platform/i18n";

const modeLabel = (mode: FolderSourceMode) =>
  ({ reference: t("app.reference"), copy: t("app.copy"), direct: t("app.direct") })[mode];

export function ModeSelector({
  value,
  onChange,
}: {
  value: FolderSourceMode;
  onChange: (mode: FolderSourceMode) => void;
}) {
  useLocale();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("app.folderMode")}>
      {(["reference", "copy", "direct"] as const).map((mode) => (
        <ChoiceRow
          key={mode}
          title={modeLabel(mode)}
          selected={value === mode}
          onPress={() => onChange(mode)}
        />
      ))}
      <Notice
        text={t(
          "mobile.referenceLinksTheOriginalFolderCopyCreatesAWorkspaceCopyDirectUsesTheOriginalFolder",
        )}
      />
    </View>
  );
}

/** One project source: a switch to include it, then its branch or folder options. */
export function SourceOptions({
  source,
  projectId,
  value,
  onChange,
}: {
  source: CatalogSource;
  projectId: string;
  value?: CatalogWorkspaceSourceInput;
  onChange: (value?: CatalogWorkspaceSourceInput) => void;
}) {
  useLocale();
  const daemon = useDaemon();
  const [branches, setBranches] = useState<RepositoryBranch[]>([]);
  const [open, setOpen] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    daemon
      .repositoryBranches(projectId, source.id)
      .then((items) => {
        if (active) {
          setBranches(items);
          setBranchError("");
        }
      })
      .catch(() => {
        if (active) setBranchError(t("repositories.branchListFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [daemon, projectId, source.id, open]);
  const pick = (base_ref?: string) => {
    if (value) onChange({ ...value, base_ref });
    setOpen(false);
  };
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, ...type.body }} numberOfLines={1}>
            {pathLabel(source.canonical_path)}
          </Text>
          <Text
            style={{ color: colors.faint, ...type.caption }}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {source.canonical_path}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("mobile.includeValue", { p0: source.canonical_path })}
          value={!!value}
          onValueChange={(checked) =>
            onChange(
              checked
                ? {
                    source_id: source.id,
                    ...(source.kind === "folder"
                      ? { mode: source.folder_mode ?? "reference" }
                      : {}),
                  }
                : undefined,
            )
          }
        />
      </View>
      {value &&
        (source.kind === "git" ? (
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            <TextField
              label={t("repositories.autoBranch")}
              placeholder={source.default_branch ?? ""}
              value={value.base_ref ?? ""}
              onChangeText={(v) => onChange({ ...value, base_ref: v || undefined })}
            />
            <View style={{ marginHorizontal: -space.lg }}>
              <ListRow
                title={t("repositories.chooseBranch")}
                expanded={open}
                onPress={() => setOpen(!open)}
              />
            </View>
            {open && (
              <View>
                <Notice
                  text={loading ? t("repositories.loadingBranches") : branchError}
                  error={!!branchError}
                />
                <ChoiceRow
                  title={t("repositories.useDefault")}
                  selected={!value.base_ref}
                  onPress={() => pick(undefined)}
                />
                {branches.map((branch) => (
                  <ChoiceRow
                    key={branch.ref}
                    title={branch.name}
                    subtitle={t(`repositories.branches.${branch.kind}`)}
                    selected={value.base_ref === branch.ref}
                    onPress={() => pick(branch.ref)}
                  />
                ))}
                {!loading && !branchError && !branches.length && (
                  <Notice text={t("repositories.noBranches")} />
                )}
                {branches.some((branch) => branch.kind === "imported") && (
                  <Notice text={t("repositories.importedSnapshotHelp")} />
                )}
              </View>
            )}
            <TextField
              label={t("mobile.branchNameOptional")}
              value={value.branch_name ?? ""}
              onChangeText={(v) => onChange({ ...value, branch_name: v || undefined })}
            />
          </View>
        ) : (
          <ModeSelector
            value={value.mode ?? "reference"}
            onChange={(mode) => onChange({ ...value, mode })}
          />
        ))}
    </View>
  );
}
