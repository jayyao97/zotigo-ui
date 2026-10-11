import { View } from "react-native";
import type { ProfilesResponse } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { useModelFavorites } from "../platform/preferences";
import { ChoiceRow } from "./BottomSheet";
import { Notice } from "./ui";

export function ProfilePicker({
  profiles,
  selected,
  disabled,
  onSelect,
}: {
  profiles: ProfilesResponse["profiles"];
  selected?: string;
  disabled: boolean;
  onSelect: (name: string) => void;
}) {
  const client = useDaemon();
  const favorites = useModelFavorites(client.connection.id);
  const saved = (name: string) =>
    favorites.items.some((f) => f.agent === "zotigo" && f.profile === name);
  const sorted = [...profiles].sort(
    (a, b) => Number(saved(b.name)) - Number(saved(a.name)),
  );
  return (
    <>
      <Notice text={favorites.error} error />
      {sorted.map((p) => (
        <View
          key={p.name}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <ChoiceRow
              title={`${saved(p.name) ? "★ " : ""}${p.name}`}
              subtitle={p.model}
              selected={p.name === selected}
              disabled={disabled}
              onPress={() => onSelect(p.name)}
            />
          </View>
        </View>
      ))}
    </>
  );
}
