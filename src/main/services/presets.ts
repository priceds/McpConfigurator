import type { PresetDefinition } from "../../shared/types";

export const PRESETS: PresetDefinition[] = [
  {
    id: "filesystem",
    label: "Filesystem Server",
    description: "Starter preset for a local filesystem MCP server using npx.",
    draft: {
      presetId: "filesystem",
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      cwd: "",
      env: {},
      notes: "Update the final argument to the directory you want the server to expose."
    }
  },
  {
    id: "fetch",
    label: "Fetch Server",
    description: "Starter preset for an MCP server that proxies web fetch operations.",
    draft: {
      presetId: "fetch",
      name: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
      cwd: "",
      env: {},
      notes: "Requires uv/uvx to be available on the local machine."
    }
  },
  {
    id: "custom-node",
    label: "Custom Node Script",
    description: "Launch a locally downloaded Node-based MCP server entry point.",
    draft: {
      presetId: "custom-node",
      name: "my-node-server",
      command: "node",
      args: ["/absolute/path/to/server.js"],
      cwd: "",
      env: {},
      notes: "Point the first argument to your local server script."
    }
  }
];
