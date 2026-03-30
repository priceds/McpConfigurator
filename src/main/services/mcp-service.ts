import { copyFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import type {
  ApplyResult,
  ManagedServerRecord,
  McpServerDraft,
  PatchPreview,
  RemoveResult,
  ResolvedTarget,
  TestResult,
  ValidationIssue,
  ValidationResult,
  TargetKind
} from "../../shared/types";
import { TARGET_ADAPTERS } from "./config-targets";
import { findExecutable, isLaunchable } from "./config-helpers";
import { ManagedStore } from "./managed-store";

export class McpService {
  constructor(private readonly managedStore: ManagedStore) {}

  async detectTargets(): Promise<ResolvedTarget[]> {
    return Promise.all(
      (Object.keys(TARGET_ADAPTERS) as TargetKind[]).map((target) => TARGET_ADAPTERS[target].detect())
    );
  }

  async validateServerDraft(draft: McpServerDraft): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const targets = await Promise.all(
      draft.targetIds.map((target) =>
        TARGET_ADAPTERS[target].detect(draft.pathOverrides?.[target])
      )
    );

    if (!draft.name.trim()) {
      issues.push({ severity: "error", field: "name", message: "Server name is required." });
    }

    if (!draft.command.trim()) {
      issues.push({ severity: "error", field: "command", message: "Command is required." });
    }

    if (draft.targetIds.length === 0) {
      issues.push({ severity: "error", field: "targets", message: "Select at least one target app." });
    }

    if (draft.cwd?.trim()) {
      try {
        const cwdStats = await stat(draft.cwd.trim());
        if (!cwdStats.isDirectory()) {
          issues.push({ severity: "error", field: "cwd", message: "Working directory must be a folder." });
        }
      } catch {
        issues.push({ severity: "warning", field: "cwd", message: "Working directory does not currently exist." });
      }
    }

    Object.entries(draft.env).forEach(([key, value]) => {
      if (!key.trim()) {
        issues.push({ severity: "error", field: "env", message: "Environment variable keys cannot be empty." });
      }

      if (value.includes("\n")) {
        issues.push({
          severity: "warning",
          field: "env",
          message: `Environment variable ${key} contains a newline and may not behave as expected.`
        });
      }
    });

    const resolvedExecutable = findExecutable(draft.command.trim());
    if (!resolvedExecutable) {
      issues.push({
        severity: "error",
        field: "command",
        message: "Command could not be resolved from PATH or the supplied local path."
      });
    } else if (!isLaunchable(draft.command.trim())) {
      issues.push({
        severity: "error",
        field: "command",
        message: `Resolved executable is not launchable on ${process.platform}.`
      });
    }

    for (const target of draft.targetIds) {
      const resolved = targets.find((item) => item.kind === target);
      if (!resolved) {
        continue;
      }

      try {
        const currentConfig = await TARGET_ADAPTERS[target].readConfig(resolved.effectivePath);
        const serverMap = currentConfig.mcpServers;
        if (serverMap && typeof serverMap === "object" && !Array.isArray(serverMap)) {
          const existingNames = Object.keys(serverMap);
          const alreadyExists =
            existingNames.includes(draft.name) && draft.name !== (draft.originalName ?? "");
          if (alreadyExists) {
            issues.push({
              severity: "error",
              field: "name",
              target,
              message: `An MCP server named "${draft.name}" already exists in ${resolved.label}.`
            });
          }
        }
      } catch (error) {
        issues.push({
          severity: "error",
          target,
          message: `Unable to parse the existing ${resolved.label} config: ${(error as Error).message}`
        });
      }
    }

    if (draft.notes?.trim()) {
      issues.push({
        severity: "info",
        field: "notes",
        message: "Notes are stored in MCP Configurator only and are not written into target configs."
      });
    }

    return {
      ok: !issues.some((issue) => issue.severity === "error"),
      issues,
      targetSummaries: targets
    };
  }

  async testServerDraft(draft: McpServerDraft, target: TargetKind): Promise<TestResult> {
    const details: string[] = [];
    const validation = await this.validateServerDraft({ ...draft, targetIds: [target] });
    if (!validation.ok) {
      return {
        ok: false,
        target,
        message: "Validation failed before the launch test could start.",
        details: validation.issues.map((issue) => issue.message)
      };
    }

    const resolvedExecutable = findExecutable(draft.command.trim());
    if (!resolvedExecutable) {
      return {
        ok: false,
        target,
        message: "Launch test could not resolve the command.",
        details
      };
    }

    details.push(`Resolved executable: ${resolvedExecutable}`);

    return new Promise<TestResult>((resolve) => {
      const child = spawn(draft.command, draft.args, {
        cwd: draft.cwd?.trim() || undefined,
        env: {
          ...process.env,
          ...draft.env
        },
        shell: false,
        windowsHide: true,
        stdio: "ignore"
      });

      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        child.kill();
        resolve({
          ok: true,
          target,
          message: "Process launched successfully and stayed alive long enough to confirm the configuration is spawnable.",
          details
        });
      }, 1200);

      child.on("spawn", () => {
        details.push("Spawn succeeded.");
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          target,
          message: "The process could not be launched.",
          details: [...details, error.message]
        });
      });

      child.on("exit", (code, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          target,
          message:
            code === 0
              ? "Process launched and exited cleanly."
              : "Process launched but exited quickly. Review the details before applying.",
          details: [...details, `Exit code: ${code ?? "null"}, signal: ${signal ?? "none"}`]
        });
      });
    });
  }

  async previewConfigPatch(draft: McpServerDraft, targets: TargetKind[]): Promise<PatchPreview[]> {
    return Promise.all(
      targets.map(async (target) => {
        const resolved = await TARGET_ADAPTERS[target].detect(draft.pathOverrides?.[target]);
        const preview = await TARGET_ADAPTERS[target].previewPatch(draft, resolved.effectivePath);
        return {
          target,
          label: resolved.label,
          path: resolved.effectivePath,
          ...preview
        };
      })
    );
  }

  async applyConfigPatch(draft: McpServerDraft, targets: TargetKind[]): Promise<ApplyResult> {
    if (targets.length === 0) {
      throw new Error("Select at least one target before applying the configuration.");
    }

    const backups: ApplyResult["updatedTargets"] = [];
    const appliedAt = new Date().toISOString();
    const managedRecordId = draft.id ?? randomUUID();

    for (const target of targets) {
      const resolved = await TARGET_ADAPTERS[target].detect(draft.pathOverrides?.[target]);
      const backupPath = await this.createBackupIfPresent(resolved.effectivePath);
      await TARGET_ADAPTERS[target].applyPatch(draft, resolved.effectivePath);
      backups.push({
        target,
        path: resolved.effectivePath,
        backupPath
      });
    }

    const record: ManagedServerRecord = {
      id: managedRecordId,
      name: draft.name,
      originalName: draft.name,
      presetId: draft.presetId,
      command: draft.command,
      args: draft.args,
      cwd: draft.cwd?.trim() || undefined,
      env: draft.env,
      notes: draft.notes?.trim() || undefined,
      targets,
      configPaths: Object.fromEntries(
        backups.map((item) => [item.target, item.path])
      ) as ManagedServerRecord["configPaths"],
      appliedAt
    };

    await this.managedStore.upsert(record);

    return {
      ok: true,
      updatedTargets: backups
    };
  }

  async listManagedServers(): Promise<ManagedServerRecord[]> {
    return this.managedStore.list();
  }

  async removeManagedServer(id: string, targets?: TargetKind[]): Promise<RemoveResult> {
    const existing = await this.managedStore.get(id);
    if (!existing) {
      throw new Error("Managed server record not found.");
    }

    const targetList = targets && targets.length > 0 ? targets : existing.targets;
    const removedTargets: RemoveResult["removedTargets"] = [];

    for (const target of targetList) {
      const effectivePath = existing.configPaths[target];
      if (!effectivePath) {
        continue;
      }

      const backupPath = await this.createBackupIfPresent(effectivePath);
      await TARGET_ADAPTERS[target].removeServer(existing.name, effectivePath);
      removedTargets.push({
        target,
        path: effectivePath,
        backupPath
      });
    }

    await this.managedStore.remove(id);

    return {
      ok: true,
      removedTargets
    };
  }

  private async createBackupIfPresent(filePath: string): Promise<string | undefined> {
    try {
      await stat(filePath);
      const backupPath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath)}.${Date.now()}.bak`
      );
      await copyFile(filePath, backupPath);
      return backupPath;
    } catch {
      return undefined;
    }
  }
}
