import type { McpToolMeta } from './mcp-tool-schemas.js';

export const GODOT_MCP_TOOL_SCHEMAS: Record<string, McpToolMeta> = {
  aegis_godot_status: {
    desc: 'Get Godot Engine binary path, version, and bridge connection status',
    props: {},
    req: []
  },
  aegis_godot_playtest: {
    desc: 'Execute an automated headless or interactive test scenario in Godot',
    props: { projectDir: { type: 'string', description: 'Target Godot project path' }, scenarioPath: { type: 'string', description: 'Optional playtest.json path' } },
    req: []
  },
  aegis_godot_inspect_ui: {
    desc: 'Zero-token responsive UI layout inspection across 4 canonical aspect ratios',
    props: { projectDir: { type: 'string', description: 'Target Godot project path' }, minTouchTarget: { type: 'number', description: 'Minimum touch target size' } },
    req: []
  },
  aegis_godot_tree: {
    desc: 'Inspect scene tree node hierarchy from a running instance or .tscn file',
    props: { tscnPath: { type: 'string', description: 'Path to target .tscn scene file' } },
    req: ['tscnPath']
  },
  aegis_godot_signals: {
    desc: 'Trace signal definitions and connections for Godot classes via ClassDB',
    props: { className: { type: 'string', description: 'Class name to query (e.g. Button)' } },
    req: ['className']
  },
  aegis_godot_screenshot: {
    desc: 'Capture high-resolution framebuffer screenshot and save locally',
    props: { outputPath: { type: 'string', description: 'Target file path for saving PNG screenshot' } },
    req: []
  },
  aegis_godot_validate: {
    desc: 'Validate GDScript syntax with native compiler and verify ClassDB API usage',
    props: { filePath: { type: 'string', description: 'Path to .gd or .tscn file' } },
    req: ['filePath']
  },
  aegis_godot_eval: {
    desc: 'Safely evaluate a runtime GDScript expression in active instance via reflection',
    props: { expression: { type: 'string', description: 'GDScript expression string to evaluate' } },
    req: ['expression']
  }
};
