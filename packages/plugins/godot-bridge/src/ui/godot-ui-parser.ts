/**
 * @file godot-ui-parser.ts
 * Static AST and structural parser for Godot 4.x UI scenes (.tscn) and GDScript controllers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface ParsedUiNode {
	name: string;
	type: string;
	parent: string | null;
	properties: Map<string, string>;
}

export interface ParsedConnection {
	signal: string;
	from: string;
	to: string;
	method: string;
}

export interface ParsedScene {
	nodes: ParsedUiNode[];
	connections: ParsedConnection[];
}

export enum GodotLayoutPreset {
	PRESET_TOP_LEFT = 0,
	PRESET_TOP_RIGHT = 1,
	PRESET_BOTTOM_LEFT = 2,
	PRESET_BOTTOM_RIGHT = 3,
	PRESET_CENTER_LEFT = 4,
	PRESET_CENTER_TOP = 5,
	PRESET_CENTER_RIGHT = 6,
	PRESET_CENTER_BOTTOM = 7,
	PRESET_CENTER = 8,
	PRESET_LEFT_WIDE = 9,
	PRESET_TOP_WIDE = 10,
	PRESET_RIGHT_WIDE = 11,
	PRESET_BOTTOM_WIDE = 12,
	PRESET_VCENTER_WIDE = 13,
	PRESET_HCENTER_WIDE = 14,
	PRESET_FULL_RECT = 15,
}

export enum GodotLayoutMode {
	LAYOUT_MODE_POSITION = 0,
	LAYOUT_MODE_ANCHORS = 1,
	LAYOUT_MODE_CONTAINER = 2,
	LAYOUT_MODE_UNCONTROLLED = 3,
}

export const GODOT_CONTAINER_TYPES: ReadonlySet<string> = new Set([
	"Container",
	"BoxContainer",
	"VBoxContainer",
	"HBoxContainer",
	"GridContainer",
	"FlowContainer",
	"HFlowContainer",
	"VFlowContainer",
	"MarginContainer",
	"PanelContainer",
	"CenterContainer",
	"ScrollContainer",
	"TabContainer",
	"AspectRatioContainer",
	"SplitContainer",
	"HSplitContainer",
	"VSplitContainer",
	"SubViewportContainer",
]);

export const GODOT_INTERACTIVE_TYPES: ReadonlySet<string> = new Set([
	"Button",
	"TextureButton",
	"CheckButton",
	"CheckBox",
	"OptionButton",
	"MenuButton",
	"LinkButton",
	"ColorPickerButton",
	"Slider",
	"HSlider",
	"VSlider",
	"LineEdit",
	"TextEdit",
	"CodeEdit",
	"SpinBox",
	"ItemList",
	"Tree",
	"TabBar",
]);

/**
 * Determines whether a given Godot node type is a container.
 */
export function isContainerType(typeName: string): boolean {
	if (!typeName) return false;
	return GODOT_CONTAINER_TYPES.has(typeName) || typeName.endsWith("Container");
}

/**
 * Determines whether a given Godot node type is an interactive control.
 */
export function isInteractiveType(typeName: string): boolean {
	if (!typeName) return false;
	if (GODOT_INTERACTIVE_TYPES.has(typeName)) return true;
	const lower = typeName.toLowerCase();
	return (
		lower.includes("button") ||
		lower.includes("slider") ||
		lower.includes("lineedit") ||
		lower.includes("itemlist")
	);
}

/**
 * Checks whether a UI node has responsive layout anchors configured.
 */
export function isResponsiveLayout(node: ParsedUiNode): boolean {
	if (node.properties.has("anchors_preset")) return true;
	return (
		node.properties.has("anchor_right") || node.properties.has("anchor_bottom")
	);
}

/**
 * Checks whether a UI node uses the full-screen rect preset (preset 15).
 */
export function isFullRectPreset(node: ParsedUiNode): boolean {
	const preset = node.properties.get("anchors_preset");
	if (preset === "15" || preset === String(GodotLayoutPreset.PRESET_FULL_RECT))
		return true;
	return (
		node.properties.get("anchor_right") === "1.0" &&
		node.properties.get("anchor_bottom") === "1.0"
	);
}

/**
 * Returns the human-readable name of a Godot anchor preset.
 */
export function getAnchorPresetName(preset: number): string | undefined {
	return GodotLayoutPreset[preset];
}

/**
 * Generates standard responsive layout property dictionary for .tscn generation.
 */
export function createResponsiveLayoutProperties(
	preset: GodotLayoutPreset = GodotLayoutPreset.PRESET_FULL_RECT,
): Record<string, string> {
	if (preset === GodotLayoutPreset.PRESET_FULL_RECT) {
		return {
			layout_mode: "3",
			anchors_preset: "15",
			anchor_right: "1.0",
			anchor_bottom: "1.0",
			grow_horizontal: "2",
			grow_vertical: "2",
		};
	}
	return {
		layout_mode: "1",
		anchors_preset: String(preset),
		grow_horizontal: "2",
		grow_vertical: "2",
	};
}

export class GodotUiParser {
	public static readonly CONTAINER_TYPES = GODOT_CONTAINER_TYPES;
	public static readonly INTERACTIVE_TYPES = GODOT_INTERACTIVE_TYPES;

	public static isContainerType(typeName: string): boolean {
		return isContainerType(typeName);
	}

	public static isInteractiveType(typeName: string): boolean {
		return isInteractiveType(typeName);
	}

	public static isResponsiveLayout(node: ParsedUiNode): boolean {
		return isResponsiveLayout(node);
	}

	public static isFullRectPreset(node: ParsedUiNode): boolean {
		return isFullRectPreset(node);
	}

	public static getAnchorPresetName(preset: number): string | undefined {
		return getAnchorPresetName(preset);
	}

	public static createResponsiveLayoutProperties(
		preset?: GodotLayoutPreset,
	): Record<string, string> {
		return createResponsiveLayoutProperties(preset);
	}

	/**
	 * Parses .tscn scene file content into structured UI nodes and signal connections.
	 */
	public static parseScene(content: string): ParsedScene {
		const nodes: ParsedUiNode[] = [];
		const connections: ParsedConnection[] = [];
		let cur: ParsedUiNode | null = null;

		for (const raw of content.split(/\r?\n/)) {
			const line = raw.trim();
			if (line.startsWith("[node ")) {
				if (cur) nodes.push(cur);
				cur = this.parseNodeHeader(line);
			} else if (line.startsWith("[connection ")) {
				if (cur) {
					nodes.push(cur);
					cur = null;
				}
				const conn = this.parseConnectionHeader(line);
				if (conn) connections.push(conn);
			} else if (cur && line.includes("=") && !line.startsWith("[")) {
				this.parsePropertyLine(cur, line);
			}
		}
		if (cur) nodes.push(cur);
		return { nodes, connections };
	}

	/**
	 * Parses node declaration header: [node name="..." type="..." parent="..."]
	 */
	public static parseNodeHeader(line: string): ParsedUiNode {
		const name = line.match(/name="([^"]+)"/)?.[1] || "Unknown";
		const type = line.match(/type="([^"]+)"/)?.[1] || "Node";
		const parent = line.match(/parent="([^"]+)"/)?.[1] || null;
		return { name, type, parent, properties: new Map() };
	}

	/**
	 * Parses connection declaration header: [connection signal="..." from="..." to="..." method="..."]
	 */
	public static parseConnectionHeader(line: string): ParsedConnection | null {
		const sig = line.match(/signal="([^"]+)"/)?.[1];
		const from = line.match(/from="([^"]+)"/)?.[1];
		const to = line.match(/to="([^"]+)"/)?.[1];
		const meth = line.match(/method="([^"]+)"/)?.[1];
		if (!sig || !from || !to || !meth) return null;
		return { signal: sig, from, to, method: meth };
	}

	/**
	 * Extracts GDScript method names declared via `func <name>(`
	 */
	public static extractScriptMethods(scriptContent: string): Set<string> {
		const methods = new Set<string>();
		for (const line of scriptContent.split(/\r?\n/)) {
			const m = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\(/);
			if (m) methods.add(m[1]);
		}
		return methods;
	}

	/**
	 * Parses a key = value property assignment line for a node.
	 */
	private static parsePropertyLine(node: ParsedUiNode, line: string): void {
		const idx = line.indexOf("=");
		if (idx !== -1) {
			node.properties.set(
				line.slice(0, idx).trim(),
				line.slice(idx + 1).trim(),
			);
		}
	}
}
