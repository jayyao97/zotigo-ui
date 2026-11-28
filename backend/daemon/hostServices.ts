import { parseUpdateStatus, type UpdateAction, type UpdateChannel } from "../../shared/updates";
import { parseModelSettings, type SettingsUpdate, type ModelSettingsChange, type ModelTestResult } from "../../shared/modelSettings";
import { attachmentReference, type MessageFileInput } from "../../shared/messageFiles";
import type { AgentCatalogEntry, AgentCatalogResponse, ProfilesResponse, SkillsResponse } from "../../shared/zotigod";
import { expectRecord, expectArray, expectStringArray, expectBoolean, expectString, expectOptionalString, expectOptionalBoolean, parseOptionalArray } from "./validation";
import { ZotigodRequestError, requestJSON } from "./http";
import { parseAgentKind } from "./sessionParsers";

export async function updateDaemon(action: UpdateAction, channel?: UpdateChannel) {
  try {
    return parseUpdateStatus(await requestJSON("/updates", action === "status" ? {} : {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action, channel})}));
  } catch (error) {
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) {
      throw new Error("This daemon does not support the update API. Upgrade it once with the current installer.");
    }
    throw error;
  }
}

export async function getModelSettings() {
  return parseModelSettings(await requestJSON("/config/models"));
}
export async function updateModelSettings(change: SettingsUpdate) {
  return parseModelSettings(await requestJSON("/config/models", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(change)}));
}
export async function testModelSettings(change: ModelSettingsChange): Promise<ModelTestResult> {
  const result = await requestJSON("/config/models/test", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(change)}) as ModelTestResult;
  if (!result || typeof result.ok !== "boolean") throw new Error("Invalid model test response");
  return result;
}

export function listSkills(sessionId?: string, forceReload = false): Promise<SkillsResponse> {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (forceReload) params.set("force_reload", "true");
  const search = params.toString();
  return requestJSON(`/skills${search ? `?${search}` : ""}`).then(parseSkillsResponse);
}

export function getProfiles(workingDirectory?: string, scope?: "global"): Promise<ProfilesResponse> {
  const params = new URLSearchParams();
  if (workingDirectory !== undefined) {
    params.set("working_directory", workingDirectory);
  }
  if (scope) params.set("scope", scope);
  const search = params.toString();
  return requestJSON(`/config/profiles${search ? `?${search}` : ""}`).then(parseProfilesResponse);
}

export function getAgents(): Promise<AgentCatalogResponse> {
  return requestJSON("/agents").then(parseAgentCatalogResponse);
}

export function prepareCodex(): Promise<AgentCatalogEntry> {
  return requestJSON("/agents/codex/prepare", { method: "POST" })
    .then((value) => parseAgentCatalogEntry(value, "prepare Codex response"));
}

export async function uploadMessageFiles(sessionId: string, text: string, files: MessageFileInput[]): Promise<string> {
  const references: string[] = [];
  for (const file of files) {
    references.push(attachmentReference(file.name, await uploadMessageFile(sessionId, file)));
  }
  return references.length ? [text, "Attached files (use tools to read or analyze):", ...references].filter(Boolean).join("\n\n") : text;
}

export async function uploadMessageFile(sessionId: string, file: MessageFileInput): Promise<string> {
  const query = new URLSearchParams({ sessionId, name: file.name });
  const response = expectRecord(await requestJSON(`/files/upload?${query}`, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.from(file.data_base64, "base64"),
  }), "uploaded attachment");
  return expectString(response.path, "attachment path");
}

function parseProfilesResponse(value: unknown): ProfilesResponse {
  const record = expectRecord(value, "profiles response");
  if (!Array.isArray(record.profiles)) {
    throw new Error("profiles response profiles must be an array");
  }
  return {
    default_profile: expectString(record.default_profile, "profiles response default_profile"),
    profiles: record.profiles.map((value, index) => {
      const profile = expectRecord(value, `profiles response profiles[${index}]`);
      return {
        name: expectString(profile.name, `profiles response profiles[${index}] name`),
        provider: expectString(profile.provider, `profiles response profiles[${index}] provider`),
        model: expectString(profile.model, `profiles response profiles[${index}] model`),
        thinking_level: expectOptionalString(profile.thinking_level, `profiles response profiles[${index}] thinking_level`),
      };
    }),
  };
}

function parseAgentCatalogResponse(value: unknown): AgentCatalogResponse {
  const record = expectRecord(value, "agent catalog response");
  const defaultAgent = parseAgentKind(record.default_agent, "agent catalog response default_agent");
  return {
    default_agent: defaultAgent,
    unavailable_agents: record.unavailable_agents === undefined ? undefined : expectArray(record.unavailable_agents, "agent catalog response unavailable_agents").map((agent, index) => parseAgentCatalogEntry(agent, `unavailable_agents[${index}]`)),
    agents: expectArray(record.agents, "agent catalog response agents")
      .map((agent, index) => parseAgentCatalogEntry(agent, `agent catalog response agents[${index}]`)),
  };
}

function parseAgentCatalogEntry(value: unknown, context: string): AgentCatalogEntry {
  const record = expectRecord(value, context);
  const availability = expectString(record.availability, `${context} availability`);
  if (availability !== "available" && availability !== "installed" && availability !== "unavailable") {
    throw new Error(`${context} availability is not supported: ${availability}`);
  }
  const capabilities = expectRecord(record.capabilities, `${context} capabilities`);
  return {
    id: parseAgentKind(record.id, `${context} id`),
    label: expectString(record.label, `${context} label`),
    availability,
    reason: expectOptionalString(record.reason, `${context} reason`),
    version: expectOptionalString(record.version, `${context} version`),
    capabilities: {
      profiles: expectBoolean(capabilities.profiles, `${context} capabilities.profiles`),
      models: expectBoolean(capabilities.models, `${context} capabilities.models`),
      projects: expectOptionalBoolean(capabilities.projects, `${context} capabilities.projects`),
      steering: expectBoolean(capabilities.steering, `${context} capabilities.steering`),
      approvals: expectBoolean(capabilities.approvals, `${context} capabilities.approvals`),
    },
    models: record.models === undefined
      ? undefined
      : expectArray(record.models, `${context} models`).map((modelValue, index) => {
          const model = expectRecord(modelValue, `${context} models[${index}]`);
          return {
            id: expectString(model.id, `${context} models[${index}] id`),
            display_name: expectString(model.display_name, `${context} models[${index}] display_name`),
            is_default: expectBoolean(model.is_default, `${context} models[${index}] is_default`),
            supported_reasoning_efforts: expectStringArray(
              model.supported_reasoning_efforts,
              `${context} models[${index}] supported_reasoning_efforts`,
            ),
          };
        }),
  };
}

function parseSkillsResponse(value: unknown): SkillsResponse {
  const record = expectRecord(value, "skills response");
  return {
    skills: parseOptionalArray(record.skills, "skills response skills", (skill, context) => {
      const entry = expectRecord(skill, context);
      return {
        name: expectString(entry.name, `${context} name`),
        description: expectString(entry.description, `${context} description`),
        scope: expectString(entry.scope, `${context} scope`),
        enabled: expectBoolean(entry.enabled, `${context} enabled`),
      };
    }) ?? [],
    diagnostics: parseOptionalArray(record.diagnostics, "skills response diagnostics", (diagnostic, context) => {
      const entry = expectRecord(diagnostic, context);
      return {
        code: expectString(entry.code, `${context} code`),
        message: expectString(entry.message, `${context} message`),
        scope: expectOptionalString(entry.scope, `${context} scope`),
        name: expectOptionalString(entry.name, `${context} name`),
      };
    }) ?? [],
  };
}

export function openDaemonFile(input: unknown): Promise<import("../localFileService").LocalPathOpenResult> {
  return requestJSON("/files/open", { signal: AbortSignal.timeout(30000), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(input as Record<string, unknown>), includeVideo: true }) }) as Promise<import("../localFileService").LocalPathOpenResult>;
}
export async function previewDaemonImage(input: unknown): Promise<import("../../shared/clientTypes").ImagePreviewResult> {
  const result = await requestJSON("/files/open", { signal: AbortSignal.timeout(30000), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const value = result as import("../../shared/clientTypes").ImagePreviewResult;
  if (value?.kind !== "image" && value?.kind !== "requires_confirmation") throw new Error("This file is not an image.");
  return value;
}
export function saveDaemonFile(input: unknown): Promise<import("../../shared/clientTypes").TextFileSnapshot> {
  return requestJSON("/files/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }) as Promise<import("../../shared/clientTypes").TextFileSnapshot>;
}

export async function listDaemonDirectory(input: { path: string; purpose: "files" | "sources"; sessionId?: string }): Promise<import("../../shared/clientTypes").DirectoryListing> {
  try {
    return await requestJSON(input.purpose === "sources" ? "/sources/directories" : "/files/list", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ path: input.path, sessionId: input.sessionId }) }) as import("../../shared/clientTypes").DirectoryListing;
  } catch (error) {
    if (error instanceof ZotigodRequestError && error.status === 404) throw new Error("Update this daemon to support directory browsing.");
    throw error;
  }
}
