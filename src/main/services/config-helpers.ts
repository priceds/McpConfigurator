import { accessSync, constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpServerDraft, TargetKind } from "../../shared/types";

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export function buildServerEntry(draft: McpServerDraft): JsonObject {
  const entry: JsonObject = {
    command: draft.command,
    args: draft.args
  };

  if (draft.cwd?.trim()) {
    entry.cwd = draft.cwd.trim();
  }

  if (Object.keys(draft.env).length > 0) {
    entry.env = draft.env;
  }

  return entry;
}

export function mergeServerIntoConfig(config: JsonObject, draft: McpServerDraft): JsonObject {
  const nextConfig: JsonObject = structuredClone(config);
  const mcpServers = ensureObject(nextConfig.mcpServers);

  if (draft.originalName && draft.originalName !== draft.name) {
    delete mcpServers[draft.originalName];
  }

  mcpServers[draft.name] = buildServerEntry(draft);
  nextConfig.mcpServers = mcpServers;
  return nextConfig;
}

export function removeServerFromConfig(config: JsonObject, serverName: string): JsonObject {
  const nextConfig: JsonObject = structuredClone(config);
  const mcpServers = ensureObject(nextConfig.mcpServers);
  delete mcpServers[serverName];
  nextConfig.mcpServers = mcpServers;
  return nextConfig;
}

export function ensureObject(value: JsonValue | undefined): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return structuredClone(value as JsonObject);
  }

  return {};
}

export function parseJsonFileContents(contents: string): JsonObject {
  if (!contents.trim()) {
    return {};
  }

  const parsed = JSON.parse(contents) as JsonValue;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config root must be a JSON object.");
  }

  return parsed as JsonObject;
}

export function stringifyJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const diff: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const previous = beforeLines[index];
    const next = afterLines[index];

    if (previous === next) {
      if (previous !== undefined) {
        diff.push(`  ${previous}`);
      }
      continue;
    }

    if (previous !== undefined) {
      diff.push(`- ${previous}`);
    }

    if (next !== undefined) {
      diff.push(`+ ${next}`);
    }
  }

  return diff.join("\n");
}

export function getDefaultConfigPath(target: TargetKind): string {
  const home = os.homedir();
  const platform = process.platform;

  if (target === "claude-desktop") {
    if (platform === "darwin") {
      return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    }

    if (platform === "win32") {
      const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
      return path.join(appData, "Claude", "claude_desktop_config.json");
    }

    return path.join(home, ".config", "Claude", "claude_desktop_config.json");
  }

  if (platform === "win32") {
    return path.join(home, ".gemini", "settings.json");
  }

  return path.join(home, ".gemini", "settings.json");
}

export function findExecutable(command: string): string | undefined {
  if (!command.trim()) {
    return undefined;
  }

  const hasPathSeparator = command.includes(path.sep) || command.includes("/");

  if (hasPathSeparator) {
    return existsSync(command) ? command : undefined;
  }

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  const extensions =
    process.platform === "win32"
      ? ["", ".exe", ".cmd", ".bat", ".ps1"]
      : [""];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

export function isLaunchable(command: string): boolean {
  const resolved = findExecutable(command);
  if (!resolved) {
    return false;
  }

  if (process.platform === "win32") {
    return true;
  }

  try {
    accessSync(resolved, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
