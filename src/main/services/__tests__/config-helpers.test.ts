import { describe, expect, it } from "vitest";
import {
  buildServerEntry,
  createDiff,
  mergeServerIntoConfig,
  removeServerFromConfig
} from "../config-helpers";

describe("config helpers", () => {
  it("builds a normalized server entry", () => {
    expect(
      buildServerEntry({
        name: "filesystem",
        command: "npx",
        args: ["server.js"],
        cwd: "/tmp",
        env: { NODE_ENV: "production" },
        targetIds: ["claude-desktop"]
      })
    ).toEqual({
      command: "npx",
      args: ["server.js"],
      cwd: "/tmp",
      env: { NODE_ENV: "production" }
    });
  });

  it("merges and renames server entries safely", () => {
    const merged = mergeServerIntoConfig(
      {
        mcpServers: {
          oldName: {
            command: "node"
          },
          another: {
            command: "uvx"
          }
        }
      },
      {
        name: "newName",
        originalName: "oldName",
        command: "node",
        args: ["server.js"],
        env: {},
        targetIds: ["claude-desktop"]
      }
    );

    expect(merged).toEqual({
      mcpServers: {
        another: {
          command: "uvx"
        },
        newName: {
          command: "node",
          args: ["server.js"]
        }
      }
    });
  });

  it("removes only the chosen server entry", () => {
    const updated = removeServerFromConfig(
      {
        mcpServers: {
          one: {
            command: "node"
          },
          two: {
            command: "uvx"
          }
        }
      },
      "one"
    );

    expect(updated).toEqual({
      mcpServers: {
        two: {
          command: "uvx"
        }
      }
    });
  });

  it("generates a readable diff", () => {
    expect(createDiff("{\n}\n", "{\n  \"mcpServers\": {}\n}\n")).toContain("+   \"mcpServers\": {}");
  });
});
