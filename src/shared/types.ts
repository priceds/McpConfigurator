export type TargetKind = "claude-desktop" | "gemini-cli";

export type IssueSeverity = "error" | "warning" | "info";

export interface McpServerDraft {
  id?: string;
  originalName?: string;
  presetId?: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  notes?: string;
  targetIds: TargetKind[];
  pathOverrides?: Partial<Record<TargetKind, string>>;
}

export interface ResolvedTarget {
  kind: TargetKind;
  label: string;
  defaultPath: string;
  effectivePath: string;
  exists: boolean;
  detected: boolean;
  notes: string[];
}

export interface ValidationIssue {
  severity: IssueSeverity;
  field?: string;
  message: string;
  target?: TargetKind;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  targetSummaries: ResolvedTarget[];
}

export interface TestResult {
  ok: boolean;
  target: TargetKind;
  message: string;
  details: string[];
}

export interface PatchPreview {
  target: TargetKind;
  label: string;
  path: string;
  before: string;
  after: string;
  diff: string;
}

export interface ApplyResult {
  ok: boolean;
  updatedTargets: Array<{
    target: TargetKind;
    path: string;
    backupPath?: string;
  }>;
}

export interface ManagedServerRecord {
  id: string;
  name: string;
  originalName?: string;
  presetId?: string;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  notes?: string;
  targets: TargetKind[];
  configPaths: Partial<Record<TargetKind, string>>;
  appliedAt: string;
}

export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  draft: Omit<McpServerDraft, "targetIds" | "pathOverrides" | "id" | "originalName">;
}

export interface RemoveResult {
  ok: boolean;
  removedTargets: Array<{
    target: TargetKind;
    path: string;
    backupPath?: string;
  }>;
}

export interface AppApi {
  detectTargets: () => Promise<ResolvedTarget[]>;
  validateServerDraft: (draft: McpServerDraft) => Promise<ValidationResult>;
  testServerDraft: (draft: McpServerDraft, target: TargetKind) => Promise<TestResult>;
  previewConfigPatch: (draft: McpServerDraft, targets: TargetKind[]) => Promise<PatchPreview[]>;
  applyConfigPatch: (draft: McpServerDraft, targets: TargetKind[]) => Promise<ApplyResult>;
  listManagedServers: () => Promise<ManagedServerRecord[]>;
  removeManagedServer: (id: string, targets?: TargetKind[]) => Promise<RemoveResult>;
  listPresets: () => Promise<PresetDefinition[]>;
}
