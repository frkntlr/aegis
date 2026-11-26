/**
 * @file godot-ui-parser.ts
 * Static AST and structural parser for Godot 4.x UI scenes (.tscn) and GDScript controllers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
	GODOT_CONTAINER_TYPES,
	GODOT_INTERACTIVE_TYPES,
	type GodotLayoutPreset,
	type ParsedConnection,
	type ParsedScene,
	type ParsedUiNode,
	createResponsiveLayoutProperties,
	getAnchorPresetName,
	isContainerType,
	isFullRectPreset,
	isInteractiveType,
	isResponsiveLayout,
} from "./godot-ui-layout-helpers.js";

export type {
	ParsedConnection,
	ParsedScene,
	ParsedUiNode,
} from "./godot-ui-layout-helpers.js";
export {
	createResponsiveLayoutProperties,
	getAnchorPresetName,
	GODOT_CONTAINER_TYPES,
	GODOT_INTERACTIVE_TYPES,
	GodotLayoutMode,
	GodotLayoutPreset,
	isContainerType,
	isFullRectPreset,
	isInteractiveType,
	isResponsiveLayout,
} from "./godot-ui-layout-helpers.js";

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
