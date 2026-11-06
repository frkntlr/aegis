import * as assert from "node:assert";
import { test } from "node:test";
import { GodotUiParser } from "./ui/godot-ui-parser.js";

test("GodotUiParser parses scene nodes, hierarchy and properties accurately", () => {
	const tscn = `[gd_scene load_steps=2 format=3]

[node name="Root" type="MarginContainer"]
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0

[node name="Content" type="VBoxContainer" parent="."]
custom_minimum_size = Vector2(300, 200)

[node name="SubmitBtn" type="Button" parent="Content"]
text = "Submit"
custom_minimum_size = Vector2(100, 48)
`;

	const { nodes, connections } = GodotUiParser.parseScene(tscn);
	assert.strictEqual(nodes.length, 3);
	assert.strictEqual(connections.length, 0);

	const [root, content, btn] = nodes;
	assert.strictEqual(root.name, "Root");
	assert.strictEqual(root.type, "MarginContainer");
	assert.strictEqual(root.parent, null);
	assert.strictEqual(root.properties.get("anchors_preset"), "15");

	assert.strictEqual(content.name, "Content");
	assert.strictEqual(content.parent, ".");
	assert.strictEqual(
		content.properties.get("custom_minimum_size"),
		"Vector2(300, 200)",
	);

	assert.strictEqual(btn.name, "SubmitBtn");
	assert.strictEqual(btn.parent, "Content");
	assert.strictEqual(btn.properties.get("text"), '"Submit"');
});

test("GodotUiParser parses signal connections correctly", () => {
	const tscn = `[gd_scene format=3]

[node name="Dialog" type="PanelContainer"]

[node name="ConfirmBtn" type="Button" parent="."]

[connection signal="pressed" from="ConfirmBtn" to="." method="_on_confirm_pressed"]
[connection signal="focus_entered" from="ConfirmBtn" to="." method="_on_focus_entered"]
`;

	const { nodes, connections } = GodotUiParser.parseScene(tscn);
	assert.strictEqual(nodes.length, 2);
	assert.strictEqual(connections.length, 2);

	assert.deepStrictEqual(connections[0], {
		signal: "pressed",
		from: "ConfirmBtn",
		to: ".",
		method: "_on_confirm_pressed",
	});

	assert.deepStrictEqual(connections[1], {
		signal: "focus_entered",
		from: "ConfirmBtn",
		to: ".",
		method: "_on_focus_entered",
	});
});

test("GodotUiParser extractScriptMethods extracts declared GDScript methods", () => {
	const gdScript = `extends Control

func _ready() -> void:
    pass

func _on_confirm_pressed():
    pass

func custom_handler(arg1: int) -> bool:
    return true
`;

	const methods = GodotUiParser.extractScriptMethods(gdScript);
	assert.ok(methods.has("_ready"));
	assert.ok(methods.has("_on_confirm_pressed"));
	assert.ok(methods.has("custom_handler"));
	assert.strictEqual(methods.has("missing_method"), false);
});

test("GodotUiParser classifies container and interactive types accurately", () => {
	// Container checks
	assert.strictEqual(GodotUiParser.isContainerType("VBoxContainer"), true);
	assert.strictEqual(GodotUiParser.isContainerType("MarginContainer"), true);
	assert.strictEqual(GodotUiParser.isContainerType("GridContainer"), true);
	assert.strictEqual(
		GodotUiParser.isContainerType("CustomCardContainer"),
		true,
	);
	assert.strictEqual(GodotUiParser.isContainerType("Button"), false);
	assert.strictEqual(GodotUiParser.isContainerType("Control"), false);
	assert.strictEqual(GodotUiParser.isContainerType(""), false);

	// Interactive checks
	assert.strictEqual(GodotUiParser.isInteractiveType("Button"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("TextureButton"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("CheckButton"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("HSlider"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("LineEdit"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("ItemList"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("Tree"), true);
	assert.strictEqual(GodotUiParser.isInteractiveType("Label"), false);
	assert.strictEqual(GodotUiParser.isInteractiveType("TextureRect"), false);
	assert.strictEqual(GodotUiParser.isInteractiveType("PanelContainer"), false);
});

test("GodotUiParser checks responsive layouts and anchor presets correctly", () => {
	const rootNode = GodotUiParser.parseNodeHeader(
		'[node name="Root" type="Control"]',
	);
	rootNode.properties.set("anchors_preset", "15");
	rootNode.properties.set("anchor_right", "1.0");
	rootNode.properties.set("anchor_bottom", "1.0");

	assert.strictEqual(GodotUiParser.isResponsiveLayout(rootNode), true);
	assert.strictEqual(GodotUiParser.isFullRectPreset(rootNode), true);

	const centerNode = GodotUiParser.parseNodeHeader(
		'[node name="Menu" type="PanelContainer"]',
	);
	centerNode.properties.set("anchors_preset", "8");
	assert.strictEqual(GodotUiParser.isResponsiveLayout(centerNode), true);
	assert.strictEqual(GodotUiParser.isFullRectPreset(centerNode), false);

	const staticNode = GodotUiParser.parseNodeHeader(
		'[node name="Static" type="Control"]',
	);
	assert.strictEqual(GodotUiParser.isResponsiveLayout(staticNode), false);
	assert.strictEqual(GodotUiParser.isFullRectPreset(staticNode), false);

	assert.strictEqual(GodotUiParser.getAnchorPresetName(0), "PRESET_TOP_LEFT");
	assert.strictEqual(GodotUiParser.getAnchorPresetName(8), "PRESET_CENTER");
	assert.strictEqual(GodotUiParser.getAnchorPresetName(15), "PRESET_FULL_RECT");

	const fullRectProps = GodotUiParser.createResponsiveLayoutProperties();
	assert.strictEqual(fullRectProps.anchors_preset, "15");
	assert.strictEqual(fullRectProps.layout_mode, "3");
	assert.strictEqual(fullRectProps.anchor_right, "1.0");
	assert.strictEqual(fullRectProps.anchor_bottom, "1.0");
	assert.strictEqual(fullRectProps.grow_horizontal, "2");
	assert.strictEqual(fullRectProps.grow_vertical, "2");
});
