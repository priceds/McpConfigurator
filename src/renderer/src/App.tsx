import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import type {
  ManagedServerRecord,
  McpServerDraft,
  PatchPreview,
  PresetDefinition,
  ResolvedTarget,
  TargetKind,
  TestResult,
  ValidationResult
} from "../../shared/types";

type ViewName = "overview" | "wizard" | "manage" | "settings";

const DEFAULT_DRAFT: McpServerDraft = {
  name: "",
  command: "",
  args: [],
  cwd: "",
  env: {},
  notes: "",
  targetIds: []
};

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseEnv(value: string): Record<string, string> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, line) => {
      const [key, ...rest] = line.split("=");
      accumulator[key.trim()] = rest.join("=").trim();
      return accumulator;
    }, {});
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function argsToText(args: string[]): string {
  return args.join("\n");
}

export function App() {
  const [view, setView] = useState<ViewName>("overview");
  const [targets, setTargets] = useState<ResolvedTarget[]>([]);
  const [presets, setPresets] = useState<PresetDefinition[]>([]);
  const [managedServers, setManagedServers] = useState<ManagedServerRecord[]>([]);
  const [draft, setDraft] = useState<McpServerDraft>(DEFAULT_DRAFT);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [pathOverrides, setPathOverrides] = useState<Partial<Record<TargetKind, string>>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [preview, setPreview] = useState<PatchPreview[]>([]);
  const [testResults, setTestResults] = useState<Partial<Record<TargetKind, TestResult>>>({});
  const [busyState, setBusyState] = useState<string>("");
  const [banner, setBanner] = useState<string>("Ready to map local MCP servers into Claude Desktop and Gemini CLI.");

  const refreshData = useEffectEvent(async () => {
    const [detectedTargets, presetList, managedList] = await Promise.all([
      window.mcpConfigurator.detectTargets(),
      window.mcpConfigurator.listPresets(),
      window.mcpConfigurator.listManagedServers()
    ]);

    startTransition(() => {
      setTargets(detectedTargets);
      setPresets(presetList);
      setManagedServers(managedList);
    });
  });

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const composedDraft = useMemo<McpServerDraft>(
    () => ({
      ...draft,
      args: parseLines(argsText),
      env: parseEnv(envText),
      pathOverrides
    }),
    [argsText, draft, envText, pathOverrides]
  );

  const previewText = useMemo(
    () => preview.map((item) => `${item.label}\n${item.diff}`).join("\n\n"),
    [preview]
  );
  const deferredPreviewText = useDeferredValue(previewText);

  async function runValidation() {
    if (composedDraft.targetIds.length === 0) {
      setBanner("Choose at least one target app before validating.");
      return;
    }

    try {
      setBusyState("Validating configuration...");
      const result = await window.mcpConfigurator.validateServerDraft(composedDraft);
      setValidation(result);
      setBanner(result.ok ? "Validation passed. You can test or preview the patch now." : "Validation found issues that should be reviewed.");
    } catch (error) {
      setBanner(`Validation failed: ${(error as Error).message}`);
    } finally {
      setBusyState("");
    }
  }

  async function runPreview() {
    if (composedDraft.targetIds.length === 0) {
      setBanner("Choose at least one target app before generating a preview.");
      return;
    }

    try {
      setBusyState("Generating config preview...");
      const result = await window.mcpConfigurator.previewConfigPatch(composedDraft, composedDraft.targetIds);
      setPreview(result);
      setBanner("Preview generated. Review the path and JSON diff before applying.");
    } catch (error) {
      setBanner(`Preview failed: ${(error as Error).message}`);
    } finally {
      setBusyState("");
    }
  }

  async function runApply() {
    if (composedDraft.targetIds.length === 0) {
      setBanner("Choose at least one target app before applying changes.");
      return;
    }

    try {
      setBusyState("Applying config changes...");
      const result = await window.mcpConfigurator.applyConfigPatch(composedDraft, composedDraft.targetIds);
      await refreshData();
      setPreview([]);
      setValidation(null);
      setTestResults({});
      setBanner(`Applied changes to ${result.updatedTargets.length} target configuration file(s).`);
      resetDraft();
      setView("manage");
    } catch (error) {
      setBanner(`Apply failed: ${(error as Error).message}`);
    } finally {
      setBusyState("");
    }
  }

  async function runTest(target: TargetKind) {
    try {
      setBusyState(`Running launch test for ${target}...`);
      const result = await window.mcpConfigurator.testServerDraft(composedDraft, target);
      setTestResults((current) => ({
        ...current,
        [target]: result
      }));
      setBanner(result.ok ? result.message : `Test failed for ${target}. Review the details before saving.`);
    } catch (error) {
      setBanner(`Test failed: ${(error as Error).message}`);
    } finally {
      setBusyState("");
    }
  }

  async function removeManagedServer(record: ManagedServerRecord) {
    try {
      setBusyState(`Removing ${record.name}...`);
      await window.mcpConfigurator.removeManagedServer(record.id);
      await refreshData();
      setBanner(`Removed ${record.name} from the managed configuration list.`);
    } catch (error) {
      setBanner(`Remove failed: ${(error as Error).message}`);
    } finally {
      setBusyState("");
    }
  }

  function resetDraft() {
    setDraft(DEFAULT_DRAFT);
    setArgsText("");
    setEnvText("");
    setPathOverrides({});
    setSelectedPresetId("custom");
  }

  function loadPreset(presetId: string) {
    setSelectedPresetId(presetId);
    if (presetId === "custom") {
      resetDraft();
      return;
    }

    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }

    setDraft((current) => ({
      ...current,
      ...preset.draft,
      targetIds: current.targetIds
    }));
    setArgsText(argsToText(preset.draft.args));
    setEnvText(envToText(preset.draft.env));
    setBanner(`Loaded the ${preset.label} starter. Adjust the local paths before applying.`);
  }

  function editManagedServer(record: ManagedServerRecord) {
    setView("wizard");
    setSelectedPresetId(record.presetId ?? "custom");
    setDraft({
      id: record.id,
      originalName: record.originalName ?? record.name,
      presetId: record.presetId,
      name: record.name,
      command: record.command,
      args: record.args,
      cwd: record.cwd,
      env: record.env,
      notes: record.notes,
      targetIds: record.targets,
      pathOverrides: record.configPaths
    });
    setArgsText(argsToText(record.args));
    setEnvText(envToText(record.env));
    setPathOverrides(record.configPaths);
    setBanner(`Editing ${record.name}. Re-run validation before applying updates.`);
  }

  const overviewStats = [
    { label: "Detected Targets", value: String(targets.length) },
    { label: "Managed Servers", value: String(managedServers.length) },
    { label: "Presets Ready", value: String(presets.length) }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar glass-panel">
        <div>
          <p className="eyebrow">Desktop Control Center</p>
          <h1>MCP Configurator</h1>
          <p className="lede">
            A polished desktop workflow for wiring local MCP servers into Claude Desktop and Gemini CLI without hand-editing JSON.
          </p>
        </div>

        <nav className="nav-stack">
          {[
            ["overview", "Overview"],
            ["wizard", "Add Server"],
            ["manage", "Manage"],
            ["settings", "Settings"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "nav-button active" : "nav-button"}
              onClick={() => setView(key as ViewName)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer glass-inset">
          <span className="status-dot" />
          <div>
            <strong>Status</strong>
            <p>{busyState || banner}</p>
          </div>
        </div>
      </aside>

      <main className="content">
        <section className="hero glass-panel">
          <div>
            <p className="eyebrow">Cross-platform</p>
            <h2>Configure once, preview everything, write safely.</h2>
          </div>
          <div className="stat-row">
            {overviewStats.map((item) => (
              <article key={item.label} className="stat-card glass-inset">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {view === "overview" && (
          <section className="dashboard-grid">
            <article className="glass-panel section-card">
              <div className="section-heading">
                <h3>Detected Targets</h3>
                <button type="button" className="pill-button" onClick={() => void refreshData()}>
                  Refresh
                </button>
              </div>
              <div className="target-grid">
                {targets.map((target) => (
                  <div className="target-card glass-inset" key={target.kind}>
                    <h4>{target.label}</h4>
                    <p>{target.effectivePath}</p>
                    <span className={target.exists ? "badge success" : "badge warning"}>
                      {target.exists ? "Found" : "Will create"}
                    </span>
                    {target.notes.map((note) => (
                      <small key={note}>{note}</small>
                    ))}
                  </div>
                ))}
              </div>
            </article>

            <article className="glass-panel section-card">
              <div className="section-heading">
                <h3>Quick Flow</h3>
              </div>
              <ol className="step-list">
                <li>Choose a preset or stay fully custom.</li>
                <li>Point the app at your local server executable or script.</li>
                <li>Validate and launch-test the draft.</li>
                <li>Preview the exact JSON patch before saving.</li>
                <li>Apply with automatic backup and managed tracking.</li>
              </ol>
            </article>
          </section>
        )}

        {view === "wizard" && (
          <section className="wizard-grid">
            <article className="glass-panel section-card">
              <div className="section-heading">
                <h3>Add Or Edit Server</h3>
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => {
                    resetDraft();
                    setValidation(null);
                    setPreview([]);
                    setTestResults({});
                    setBanner("Starting a fresh MCP server draft.");
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="form-grid">
                <label>
                  Preset
                  <select value={selectedPresetId} onChange={(event) => loadPreset(event.target.value)}>
                    <option value="custom">Custom</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Server name
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="filesystem"
                  />
                </label>

                <label>
                  Command
                  <input
                    value={draft.command}
                    onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
                    placeholder="node / npx / uvx / absolute path"
                  />
                </label>

                <label>
                  Working directory
                  <input
                    value={draft.cwd ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
                    placeholder="/absolute/path/to/project"
                  />
                </label>

                <label className="full-span">
                  Arguments
                  <textarea
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    placeholder="One argument per line"
                    rows={6}
                  />
                </label>

                <label className="full-span">
                  Environment variables
                  <textarea
                    value={envText}
                    onChange={(event) => setEnvText(event.target.value)}
                    placeholder="KEY=value"
                    rows={5}
                  />
                </label>

                <label className="full-span">
                  Notes
                  <textarea
                    value={draft.notes ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Optional reminders for this managed entry"
                    rows={4}
                  />
                </label>
              </div>
            </article>

            <article className="glass-panel section-card">
              <div className="section-heading">
                <h3>Targets And Safe Write Paths</h3>
              </div>

              <div className="target-selection">
                {targets.map((target) => {
                  const selected = composedDraft.targetIds.includes(target.kind);
                  return (
                    <div key={target.kind} className="target-editor glass-inset">
                      <div className="target-toggle">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                targetIds: event.target.checked
                                  ? [...current.targetIds, target.kind]
                                  : current.targetIds.filter((item) => item !== target.kind)
                              }))
                            }
                          />
                          <span>{target.label}</span>
                        </label>
                        <span className={target.exists ? "badge success" : "badge warning"}>
                          {target.exists ? "Existing config" : "Config will be created"}
                        </span>
                      </div>

                      <p className="muted">{target.effectivePath}</p>
                      <input
                        value={pathOverrides[target.kind] ?? ""}
                        onChange={(event) =>
                          setPathOverrides((current) => ({
                            ...current,
                            [target.kind]: event.target.value
                          }))
                        }
                        placeholder={`Override ${target.label} config path`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="action-row">
                <button className="primary-button" type="button" onClick={() => void runValidation()}>
                  Validate
                </button>
                <button className="secondary-button" type="button" onClick={() => void runPreview()}>
                  Preview Patch
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    const firstTarget = composedDraft.targetIds[0];
                    if (firstTarget) {
                      void runTest(firstTarget);
                    }
                  }}
                >
                  Quick Test
                </button>
                <button className="primary-button accent" type="button" onClick={() => void runApply()}>
                  Apply
                </button>
              </div>
            </article>

            <article className="glass-panel section-card">
              <div className="section-heading">
                <h3>Validation And Test Results</h3>
              </div>
              <div className="result-stack">
                {validation?.issues.map((issue, index) => (
                  <div key={`${issue.message}-${index}`} className={`result-card ${issue.severity}`}>
                    <strong>{issue.severity.toUpperCase()}</strong>
                    <p>{issue.message}</p>
                  </div>
                ))}
                {Object.values(testResults).map((result) => (
                  <div key={result.target} className={`result-card ${result.ok ? "info" : "error"}`}>
                    <strong>{result.target}</strong>
                    <p>{result.message}</p>
                    <small>{result.details.join(" | ")}</small>
                  </div>
                ))}
                {!validation && Object.keys(testResults).length === 0 && (
                  <div className="empty-state">Validation and launch feedback will appear here.</div>
                )}
              </div>
            </article>

            <article className="glass-panel section-card full-width">
              <div className="section-heading">
                <h3>Patch Preview</h3>
              </div>
              <pre className="diff-viewer">{deferredPreviewText || "Generate a preview to inspect exact JSON changes."}</pre>
            </article>
          </section>
        )}

        {view === "manage" && (
          <section className="manage-grid">
            {managedServers.map((record) => (
              <article className="glass-panel section-card" key={record.id}>
                <div className="section-heading">
                  <div>
                    <h3>{record.name}</h3>
                    <p className="muted">{record.command}</p>
                  </div>
                  <span className="badge info">{record.targets.join(" + ")}</span>
                </div>

                <p className="muted">Last applied: {new Date(record.appliedAt).toLocaleString()}</p>
                <pre className="mini-preview">{argsToText(record.args) || "No args"}</pre>

                <div className="action-row">
                  <button className="secondary-button" type="button" onClick={() => editManagedServer(record)}>
                    Edit
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      editManagedServer(record);
                      const firstTarget = record.targets[0];
                      if (firstTarget) {
                        void runTest(firstTarget);
                      }
                    }}
                  >
                    Re-test
                  </button>
                  <button className="danger-button" type="button" onClick={() => void removeManagedServer(record)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {managedServers.length === 0 && (
              <article className="glass-panel section-card">
                <h3>No managed servers yet</h3>
                <p className="muted">Create your first MCP server draft to start tracking safe updates and removals.</p>
              </article>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="settings-grid">
            <article className="glass-panel section-card">
              <h3>Target Defaults</h3>
              <div className="result-stack">
                {targets.map((target) => (
                  <div key={target.kind} className="target-card glass-inset">
                    <strong>{target.label}</strong>
                    <p>{target.defaultPath}</p>
                    {target.notes.map((note) => (
                      <small key={note}>{note}</small>
                    ))}
                  </div>
                ))}
              </div>
            </article>

            <article className="glass-panel section-card">
              <h3>Usage Notes</h3>
              <ul className="note-list">
                <li>The app configures locally available MCP servers only.</li>
                <li>Backups are created before every config write or removal.</li>
                <li>Notes stay inside MCP Configurator and are not written into Claude or Gemini configs.</li>
                <li>Gemini CLI support currently assumes a JSON settings file at `~/.gemini/settings.json` unless you override it.</li>
              </ul>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
