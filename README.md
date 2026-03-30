# MCP Configurator

Electron + React desktop app for configuring already-installed MCP servers for Claude Desktop and Gemini CLI.

## Highlights

- Detects Claude Desktop and Gemini CLI config locations
- Adds custom or preset MCP server entries
- Validates command paths, args, env vars, and duplicate names
- Previews JSON changes before writing
- Creates timestamped backups before every config update
- Supports edit, re-test, and remove flows for managed entries
- Packages for macOS, Windows, and Linux through `electron-builder`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run package
```

Platform-specific packaging:

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

## GitHub CI/CD

- Pushes and pull requests to `main` run CI automatically.
- Pushing a tag like `v0.1.0` creates a GitHub Release and attaches macOS, Windows, and Linux desktop artifacts.
- The workflows are defined in:
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`

### First release checklist

```bash
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

## Notes

- Claude Desktop defaults are resolved per platform.
- Gemini CLI is currently assumed to use `~/.gemini/settings.json` unless the user overrides it in the app.
- The app configures local server commands; it does not install MCP servers.
