import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServerDraft, ResolvedTarget, TargetKind } from "../../shared/types";
import {
  createDiff,
  getDefaultConfigPath,
  mergeServerIntoConfig,
  parseJsonFileContents,
  removeServerFromConfig,
  stringifyJson,
  type JsonObject
} from "./config-helpers";

export interface ConfigTargetAdapter {
  kind: TargetKind;
  label: string;
  detect(pathOverride?: string): Promise<ResolvedTarget>;
  readConfig(effectivePath: string): Promise<JsonObject>;
  previewPatch(draft: McpServerDraft, effectivePath: string): Promise<{ before: string; after: string; diff: string }>;
  applyPatch(draft: McpServerDraft, effectivePath: string): Promise<void>;
  removeServer(serverName: string, effectivePath: string): Promise<void>;
}

class JsonConfigTargetAdapter implements ConfigTargetAdapter {
  constructor(
    public readonly kind: TargetKind,
    public readonly label: string
  ) {}

  async detect(pathOverride?: string): Promise<ResolvedTarget> {
    const defaultPath = getDefaultConfigPath(this.kind);
    const effectivePath = pathOverride?.trim() || defaultPath;

    try {
      await readFile(effectivePath, "utf8");
      return {
        kind: this.kind,
        label: this.label,
        defaultPath,
        effectivePath,
        exists: true,
        detected: !pathOverride,
        notes: []
      };
    } catch {
      return {
        kind: this.kind,
        label: this.label,
        defaultPath,
        effectivePath,
        exists: false,
        detected: !pathOverride,
        notes: pathOverride
          ? ["Using a custom config path override."]
          : ["Default config path will be created when the configuration is applied."]
      };
    }
  }

  async readConfig(effectivePath: string): Promise<JsonObject> {
    try {
      const contents = await readFile(effectivePath, "utf8");
      return parseJsonFileContents(contents);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  async previewPatch(
    draft: McpServerDraft,
    effectivePath: string
  ): Promise<{ before: string; after: string; diff: string }> {
    const current = await this.readConfig(effectivePath);
    const merged = mergeServerIntoConfig(current, draft);
    const before = stringifyJson(current);
    const after = stringifyJson(merged);
    return {
      before,
      after,
      diff: createDiff(before, after)
    };
  }

  async applyPatch(draft: McpServerDraft, effectivePath: string): Promise<void> {
    const current = await this.readConfig(effectivePath);
    const merged = mergeServerIntoConfig(current, draft);
    await mkdir(path.dirname(effectivePath), { recursive: true });
    await writeFile(effectivePath, stringifyJson(merged), "utf8");
  }

  async removeServer(serverName: string, effectivePath: string): Promise<void> {
    const current = await this.readConfig(effectivePath);
    const updated = removeServerFromConfig(current, serverName);
    await mkdir(path.dirname(effectivePath), { recursive: true });
    await writeFile(effectivePath, stringifyJson(updated), "utf8");
  }
}

export const TARGET_ADAPTERS: Record<TargetKind, ConfigTargetAdapter> = {
  "claude-desktop": new JsonConfigTargetAdapter("claude-desktop", "Claude Desktop"),
  "gemini-cli": new JsonConfigTargetAdapter("gemini-cli", "Gemini CLI")
};
