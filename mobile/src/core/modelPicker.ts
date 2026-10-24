import type {
  AgentCatalogEntry,
  AgentKind,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
import type { ModelFavorite } from "@zotigo/shared/modelFavorites";
import { compatibleReasoningEffort } from "@zotigo/shared/modelSelection";

export type PickerAgent = Pick<AgentCatalogEntry, "id" | "label" | "models">;

export function availableModelChoice(
  choice: ModelFavorite,
  agents: PickerAgent[],
  profiles?: ProfilesResponse,
  fixedAgent?: AgentKind,
): boolean {
  if (fixedAgent && choice.agent !== fixedAgent) return false;
  if (!agents.some((a) => a.id === choice.agent)) return false;
  if (choice.agent === "zotigo")
    return !!profiles?.profiles.some((p) => p.name === choice.profile);
  const model = agents
    .find((a) => a.id === "codex")
    ?.models?.find((m) => m.id === choice.model);
  return (
    !!model &&
    (!model.supported_reasoning_efforts.length ||
      model.supported_reasoning_efforts.includes(choice.reasoningEffort))
  );
}

export function defaultModelChoice(
  agent: AgentKind,
  agents: PickerAgent[],
  profiles?: ProfilesResponse,
): ModelFavorite {
  if (agent === "zotigo")
    return { agent, profile: profiles?.default_profile ?? "" };
  const models = agents.find((a) => a.id === "codex")?.models ?? [];
  const model = models.find((m) => m.is_default) ?? models[0];
  return {
    agent,
    model: model?.id ?? "",
    reasoningEffort: compatibleReasoningEffort(
      model?.supported_reasoning_efforts ?? [],
      "medium",
    ),
  };
}
