/**
 * @file godot-ui-layout-helpers.ts
 * Types, layout presets, node classification sets, and responsive property helpers for Godot 4.x UI.
 * Complies with Demir Kafes: <245 lines/file, <40 lines/function, 0 any.
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
