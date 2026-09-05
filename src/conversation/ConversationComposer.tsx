import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Blocks,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Folder,
  FolderPlus,
  GitBranch,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import type { AgentCatalogEntry, AgentKind, AgentModel, ApprovalPolicy, RuntimeProfile, SkillSummary } from "../../shared/zotigod";
import type { DesktopProject, DesktopWorkspace } from "../../shared/clientTypes";
import { approvalPolicyLabel } from "../../shared/approvalPolicy";
import { resizeTextareaToContent } from "../textareaSizing";

export type ComposerAttachment = {
  id: string;
  kind: "image";
  name: string;
  file: File;
  mimeType: string;
  url?: string;
};

export function ComposerSkills({
  skills,
  selectedSkillNames,
  loading,
  error,
  open,
  activeIndex,
  onSelect,
  onRemove,
  onHighlight,
}: {
  skills: SkillSummary[];
  selectedSkillNames: string[];
  loading: boolean;
  error: string | null;
  open: boolean;
  activeIndex: number;
  onSelect: (skill: SkillSummary) => void;
  onRemove: (name: string) => void;
  onHighlight: (index: number) => void;
}) {
  if (!open && selectedSkillNames.length === 0) return null;
  return (
    <>
      {selectedSkillNames.length > 0 && (
        <div className="selected-skills" aria-label="Selected skills">
          {selectedSkillNames.map((name) => (
            <span className="selected-skill" key={name}>
              <Sparkles size={12} strokeWidth={1.8} />
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(name)}>
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="skill-command-menu" role="listbox" aria-label="Skills">
          <div className="skill-command-heading">
            <Blocks size={14} strokeWidth={1.8} />
            <span>Skills</span>
            <small>↑↓ navigate · Enter select</small>
          </div>
          <div className="skill-command-options">
            {loading ? (
              <p>Loading skills…</p>
            ) : error ? (
              <p className="error">Could not load skills · {error}</p>
            ) : skills.length === 0 ? (
              <p>No matching skills</p>
            ) : skills.map((skill, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                key={skill.name}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHighlight(index)}
                onClick={() => onSelect(skill)}
              >
                <Sparkles size={14} strokeWidth={1.8} />
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.description}</small>
                </span>
                <em>{skill.scope}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


export function ComposerAttachmentStrip({
  attachments,
  onPreview,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="composer-attachments" aria-label="Pending attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="composer-attachment">
          {attachment.url ? (
            <button
              type="button"
              className="attachment-preview-button"
              aria-label={`Preview ${attachment.name}`}
              onClick={() => onPreview(attachment.id)}
            >
              <img src={attachment.url} alt={attachment.name} loading="lazy" decoding="async" />
            </button>
          ) : null}
          <button
            type="button"
            className="composer-attachment-remove"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => onRemove(attachment.id)}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function NewSessionPrompt({
  selectedProject,
  selectedWorkspace,
  requiresWorkspace,
  message,
  isBusy,
  prompt,
  skills,
  selectedSkillNames,
  skillsLoading,
  skillsError,
  skillMenuOpen,
  skillMenuIndex,
  attachments,
  projects,
  workspaces,
  onCreate,
  onPromptChange,
  onPromptKeyDown,
  onSelectSkill,
  onRemoveSkill,
  onHighlightSkill,
  onPromptPaste,
  onPreviewAttachment,
  onRemoveAttachment,
  onSelectProject,
  onSelectWorkspace,
  onCreateProject,
  onCreateWorkspace,
  profiles,
  selectedProfile,
  profilesLoading,
  onSelectProfile,
  agents,
  agentsLoading,
  selectedAgent,
  onSelectAgent,
  codexModels,
  selectedCodexModel,
  selectedCodexReasoningEffort,
  onSelectCodexModel,
  onSelectCodexReasoningEffort,
  selectedApprovalPolicy,
  onSelectApprovalPolicy,
  runtimeAvailable,
}: {
  selectedProject: DesktopProject | null;
  selectedWorkspace: DesktopWorkspace | null;
  requiresWorkspace: boolean;
  message: string | null;
  isBusy: boolean;
  prompt: string;
  skills: SkillSummary[];
  selectedSkillNames: string[];
  skillsLoading: boolean;
  skillsError: string | null;
  skillMenuOpen: boolean;
  skillMenuIndex: number;
  attachments: ComposerAttachment[];
  projects: DesktopProject[];
  workspaces: DesktopWorkspace[];
  onCreate: (prompt: string) => void;
  onPromptChange: (prompt: string) => void;
  onPromptKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectSkill: (skill: SkillSummary) => void;
  onRemoveSkill: (name: string) => void;
  onHighlightSkill: (index: number) => void;
  onPromptPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onPreviewAttachment: (id: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateProject: () => void;
  onCreateWorkspace: (project: DesktopProject) => void;
  profiles: RuntimeProfile[];
  selectedProfile: string;
  profilesLoading: boolean;
  onSelectProfile: (profile: string) => void;
  agents: AgentCatalogEntry[];
  agentsLoading: boolean;
  selectedAgent: AgentKind;
  onSelectAgent: (agent: AgentKind) => void;
  codexModels: AgentModel[];
  selectedCodexModel: string;
  selectedCodexReasoningEffort: string;
  onSelectCodexModel: (model: string) => void;
  onSelectCodexReasoningEffort: (effort: string) => void;
  selectedApprovalPolicy: ApprovalPolicy;
  onSelectApprovalPolicy: (approvalPolicy: ApprovalPolicy) => void;
  runtimeAvailable: boolean;
}) {
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const selectedCodexModelEntry = codexModels.find((model) => model.id === selectedCodexModel);
  const runtimeReady = selectedAgent === "codex"
    ? Boolean(selectedCodexModel && selectedCodexReasoningEffort)
    : profiles.length > 0;
  const workspaceGroups = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase();
    return projects.flatMap((project) => {
      const projectMatches = project.name.toLocaleLowerCase().includes(query);
      const readyWorkspaces = workspaces.filter(
        (workspace) =>
          workspace.project_id === project.id
          && workspace.status === "ready"
          && (!query || projectMatches || workspace.title.toLocaleLowerCase().includes(query)),
      );
      if (query && !projectMatches && readyWorkspaces.length === 0) {
        return [];
      }
      return [{ project, workspaces: readyWorkspaces }];
    });
  }, [projectQuery, projects, workspaces]);

  useLayoutEffect(() => {
    resizeTextareaToContent(promptTextareaRef.current);
  }, [prompt]);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectPickerRef.current?.contains(event.target)) {
        setProjectMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [projectMenuOpen]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(prompt);
  }

  return (
    <div className="new-chat">
      <form className="new-chat-composer" onSubmit={submit}>
        <div className="new-chat-project-context" ref={projectPickerRef}>
          <button
            type="button"
            className="new-chat-project-trigger"
            aria-expanded={projectMenuOpen}
            disabled={!runtimeAvailable || isBusy}
            onClick={() => {
              setProjectQuery("");
              setProjectMenuOpen((open) => !open);
            }}
          >
            <Folder size={14} strokeWidth={1.8} />
            <span>
              {selectedWorkspace
                ? `${selectedProject?.name ?? "Project"} / ${selectedWorkspace.title}`
                : selectedProject
                  ? `${selectedProject.name} / Choose Workspace`
                  : "Scratch"}
            </span>
            <ChevronDown size={13} strokeWidth={1.8} />
          </button>

          {projectMenuOpen && (
            <div className="new-chat-project-menu">
              <label className="new-chat-project-search">
                <Search size={14} strokeWidth={1.8} />
                <input
                  autoFocus
                  value={projectQuery}
                  onChange={(event) => setProjectQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setProjectMenuOpen(false);
                    }
                  }}
                  placeholder="Search Workspaces"
                />
              </label>
              <div className="new-chat-project-options" aria-label="Workspace picker">
                <div className="new-chat-workspace-groups">
                  {workspaceGroups.map(({ project, workspaces: projectWorkspaces }) => (
                    <div className="new-chat-project-option-group" key={project.id}>
                      <div className="new-chat-project-group-label">
                        <Folder size={14} strokeWidth={1.8} />
                        <span>{project.name}</span>
                      </div>
                      {projectWorkspaces.map((workspace) => (
                        <button
                          type="button"
                          className="new-chat-workspace-option"
                          aria-selected={workspace.id === selectedWorkspace?.id}
                          key={workspace.id}
                          onClick={() => {
                            onSelectWorkspace(workspace.id);
                            setProjectMenuOpen(false);
                          }}
                        >
                          <GitBranch size={13} strokeWidth={1.8} />
                          <span>{workspace.title}</span>
                          {workspace.id === selectedWorkspace?.id && <Check size={14} strokeWidth={2} />}
                        </button>
                      ))}
                      {projectWorkspaces.length === 0 && (
                        <button
                          type="button"
                          className="new-chat-create-workspace-option"
                          onClick={() => {
                            setProjectMenuOpen(false);
                            onCreateWorkspace(project);
                          }}
                        >
                          <Plus size={13} strokeWidth={1.8} />
                          <span>Create Workspace</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {projectQuery.trim() && workspaceGroups.length === 0 && <p>No matching Workspaces</p>}
                </div>
                <div className="new-chat-project-actions">
                  <button
                    type="button"
                    aria-selected={!selectedProject}
                    onClick={() => {
                      onSelectProject(null);
                      setProjectMenuOpen(false);
                    }}
                  >
                    <Circle size={13} strokeWidth={1.8} />
                    <span>Scratch — no Project or Workspace</span>
                    {!selectedProject && <Check size={14} strokeWidth={2} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onCreateProject();
                    }}
                  >
                    <FolderPlus size={13} strokeWidth={1.8} />
                    <span>Create Project…</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {requiresWorkspace && (
          <p className="new-chat-workspace-hint">
            {selectedAgent === "codex"
              ? "Codex sessions require a ready Workspace."
              : "Choose an existing Workspace or switch to Scratch."}
          </p>
        )}

        <div className="new-chat-input">
          <ComposerSkills
            skills={skills}
            selectedSkillNames={selectedSkillNames}
            loading={skillsLoading}
            error={skillsError}
            open={skillMenuOpen}
            activeIndex={skillMenuIndex}
            onSelect={onSelectSkill}
            onRemove={onRemoveSkill}
            onHighlight={onHighlightSkill}
          />
          <ComposerAttachmentStrip
            attachments={attachments}
            onPreview={onPreviewAttachment}
            onRemove={onRemoveAttachment}
          />
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onPaste={onPromptPaste}
            onKeyDown={onPromptKeyDown}
            placeholder="Do anything"
            rows={3}
            autoFocus
          />
          <button
            type="submit"
            className="send-button"
            disabled={
              !runtimeAvailable
              || requiresWorkspace
              || isBusy
              || profilesLoading
              || agentsLoading
              || !runtimeReady
              || (prompt.trim() === "" && attachments.length === 0)
            }
            aria-label="Create session"
          >
            <ArrowUp size={19} strokeWidth={2.2} />
          </button>
        </div>
        <div className="new-chat-meta">
          {selectedAgent === "zotigo" && (
            <ApprovalPolicyPicker
              value={selectedApprovalPolicy}
              onChange={onSelectApprovalPolicy}
              disabled={isBusy}
            />
          )}
          <RuntimeSettingsPicker
            agents={agents}
            selectedAgent={selectedAgent}
            onSelectAgent={onSelectAgent}
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfile={onSelectProfile}
            codexModels={codexModels}
            selectedCodexModel={selectedCodexModel}
            onSelectCodexModel={onSelectCodexModel}
            selectedCodexReasoningEffort={selectedCodexReasoningEffort}
            onSelectCodexReasoningEffort={onSelectCodexReasoningEffort}
            disabled={isBusy || profilesLoading || agentsLoading || !selectedCodexModelEntry && selectedAgent === "codex"}
          />
        </div>
      </form>

      {message && <p className="new-chat-error">{message}</p>}
    </div>
  );
}

export function codexModelLabel(models: AgentModel[], modelId: string): string {
  return models.find((model) => model.id === modelId)?.display_name || modelId || "Codex";
}

export function compatibleReasoningEffort(efforts: string[], current: string): string {
  return efforts.includes(current) ? current : efforts.includes("medium") ? "medium" : efforts[0] ?? "";
}

export function RuntimeSettingsPicker({
  agents,
  selectedAgent,
  onSelectAgent,
  profiles,
  selectedProfile,
  onSelectProfile,
  codexModels,
  selectedCodexModel,
  onSelectCodexModel,
  selectedCodexReasoningEffort,
  onSelectCodexReasoningEffort,
  agentLocked = false,
  disabled,
}: {
  agents: AgentCatalogEntry[];
  selectedAgent: AgentKind;
  onSelectAgent: (agent: AgentKind) => void;
  profiles: RuntimeProfile[];
  selectedProfile: string;
  onSelectProfile: (profile: string) => void;
  codexModels: AgentModel[];
  selectedCodexModel: string;
  onSelectCodexModel: (model: string) => void;
  selectedCodexReasoningEffort: string;
  onSelectCodexReasoningEffort: (effort: string) => void;
  agentLocked?: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"agent" | "profile" | "model" | "thinking" | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedModel = codexModels.find((model) => model.id === selectedCodexModel);
  const selectedAgentLabel = agents.find((agent) => agent.id === selectedAgent)?.label ?? selectedAgent;

  useLayoutEffect(() => {
    if (open) {
      const selected = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      (selected ?? menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    }
  }, [open, section]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setOpen(false);
        setSection(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (section) setSection(null);
        else {
          setOpen(false);
          pickerRef.current?.querySelector("button")?.focus();
        }
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, section]);

  const label = selectedAgent === "codex"
    ? `${codexModelLabel(codexModels, selectedCodexModel)} · ${selectedCodexReasoningEffort || "Thinking"}`
    : selectedProfile || "Zotigo";

  function choose(action: () => void) {
    action();
    setOpen(false);
    setSection(null);
    pickerRef.current?.querySelector("button")?.focus();
  }

  return (
    <div className="runtime-settings-wrap" ref={pickerRef}>
      <button
        type="button"
        className="composer-model runtime-settings-trigger"
        aria-label={`Runtime settings: ${label}`}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setSection(null);
          setOpen((current) => !current);
        }}
      >
        {label}
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="runtime-settings-menu" ref={menuRef} role="menu" aria-label="Runtime settings"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
              : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[index]?.focus();
          }}
        >
          {!section && <>
          <button
            type="button"
            className="runtime-settings-row"
            role="menuitem"
            disabled={agentLocked}
            onClick={() => setSection(section === "agent" ? null : "agent")}
          >
            <strong>Agent</strong>
            <span>{selectedAgentLabel}</span>
            {!agentLocked && <ChevronRight size={15} strokeWidth={1.8} />}
          </button>
          {selectedAgent === "codex" ? (
            <>
              <button
                type="button"
                className="runtime-settings-row"
                role="menuitem"
                onClick={() => setSection(section === "model" ? null : "model")}
              >
                <strong>Model</strong>
                <span>{codexModelLabel(codexModels, selectedCodexModel)}</span>
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="runtime-settings-row"
                role="menuitem"
                onClick={() => setSection(section === "thinking" ? null : "thinking")}
              >
                <strong>Thinking</strong>
                <span>{selectedCodexReasoningEffort}</span>
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="runtime-settings-row"
              role="menuitem"
              onClick={() => setSection(section === "profile" ? null : "profile")}
            >
              <strong>Profile</strong>
              <span>{selectedProfile}</span>
              <ChevronRight size={15} strokeWidth={1.8} />
            </button>
          )}
          </>}
          {section && (
            <div className="runtime-settings-submenu" role="menu" aria-label={`${section} options`}>
              <button type="button" className="runtime-settings-back" role="menuitem" onClick={() => setSection(null)}>
                <span><ChevronLeft size={14} /> {section === "thinking" ? "Thinking" : section === "model" ? "Model" : section === "profile" ? "Profile" : "Agent"}</span>
              </button>
              {section === "agent" && agents.map((agent) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={agent.id === selectedAgent}
                  key={agent.id}
                  onClick={() => choose(() => onSelectAgent(agent.id))}
                >
                  <span>{agent.label}</span>
                  {agent.id === selectedAgent && <Check size={15} strokeWidth={2} />}
                </button>
              ))}
              {section === "profile" && profiles.map((profile) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={profile.name === selectedProfile}
                  key={profile.name}
                  onClick={() => choose(() => onSelectProfile(profile.name))}
                >
                  <span>{profile.name}</span>
                  {profile.name === selectedProfile && <Check size={15} strokeWidth={2} />}
                </button>
              ))}
              {section === "model" && codexModels.map((model) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={model.id === selectedCodexModel}
                  key={model.id}
                  onClick={() => choose(() => onSelectCodexModel(model.id))}
                >
                  <span>{model.display_name}</span>
                  {model.id === selectedCodexModel && <Check size={15} strokeWidth={2} />}
                </button>
              ))}
              {section === "thinking" && (selectedModel?.supported_reasoning_efforts ?? []).map((effort) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={effort === selectedCodexReasoningEffort}
                  key={effort}
                  onClick={() => choose(() => onSelectCodexReasoningEffort(effort))}
                >
                  <span>{effort}</span>
                  {effort === selectedCodexReasoningEffort && <Check size={15} strokeWidth={2} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ApprovalPolicyPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ApprovalPolicy | null;
  onChange: (value: ApprovalPolicy) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const isFullAccess = value === "bypass_permissions";

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(nextValue: ApprovalPolicy) {
    setOpen(false);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }

  return (
    <div className="approval-policy-wrap" ref={pickerRef}>
      <button
        type="button"
        className={`composer-pill approval-policy-trigger ${isFullAccess ? "full-access" : "auto"}`}
        aria-label={`Access mode: ${approvalPolicyLabel(value)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {isFullAccess ? (
          <ShieldAlert size={16} strokeWidth={1.8} />
        ) : (
          <ShieldCheck size={16} strokeWidth={1.8} />
        )}
        {approvalPolicyLabel(value)}
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="approval-policy-menu" role="menu" aria-label="Access mode">
          <button type="button" role="menuitemradio" aria-checked={value === "auto"} onClick={() => choose("auto")}>
            <ShieldCheck size={16} strokeWidth={1.8} />
            <span>
              <strong>Auto</strong>
              <small>Use safety checks and request approval when needed</small>
            </span>
            {value === "auto" && <Check size={15} strokeWidth={2} />}
          </button>
          <button
            type="button"
            className="full-access-option"
            role="menuitemradio"
            aria-checked={value === "bypass_permissions"}
            onClick={() => choose("bypass_permissions")}
          >
            <ShieldAlert size={16} strokeWidth={1.8} />
            <span>
              <strong>Full access</strong>
              <small>Run tools without safety classification or approval</small>
            </span>
            {value === "bypass_permissions" && <Check size={15} strokeWidth={2} />}
          </button>
        </div>
      )}
    </div>
  );
}
