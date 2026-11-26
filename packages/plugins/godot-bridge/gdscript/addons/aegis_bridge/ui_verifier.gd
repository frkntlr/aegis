@tool
class_name AegisUiVerifier
extends RefCounted

const ASPECT_RATIOS = {
	"16:9": Vector2(1920, 1080),
	"21:9": Vector2(2560, 1080),
	"16:10": Vector2(1920, 1200),
	"4:3": Vector2(1440, 1080),
	"9:16": Vector2(1080, 1920),
	"9:18": Vector2(1080, 2160),
	"9:19.5": Vector2(1080, 2340),
	"9:20": Vector2(1080, 2400),
	"3:4": Vector2(1080, 1440)
}

static func collect_ui_nodes(root: Node) -> Array:
	var result = []
	_traverse_control_tree(root, result)
	return result

static func _traverse_control_tree(node: Node, acc: Array) -> void:
	if node is Control and node.visible:
		var rect = node.get_global_rect()
		var node_info = {
			"id": str(node.get_path()),
			"name": node.name,
			"type": node.get_class(),
			"visible": node.visible,
			"layout_mode": node.layout_mode if "layout_mode" in node else 0,
			"anchors_preset": node.anchors_preset if "anchors_preset" in node else -1,
			"rect": {
				"x": rect.position.x,
				"y": rect.position.y,
				"width": rect.size.x,
				"height": rect.size.y
			}
		}
		node_info.merge(_control_metadata(node))
		acc.append(node_info)
	for child in node.get_children():
		_traverse_control_tree(child, acc)

static func _control_metadata(node: Node) -> Dictionary:
	var metadata = {}
	if "text" in node and node.get("text") != null:
		metadata["text"] = str(node.get("text"))
	if "tooltip_text" in node and node.get("tooltip_text") != "":
		metadata["tooltip_text"] = str(node.get("tooltip_text"))
	if "disabled" in node:
		metadata["disabled"] = bool(node.get("disabled"))
	if "theme_type_variation" in node and str(node.get("theme_type_variation")) != "":
		metadata["theme_type_variation"] = str(node.get("theme_type_variation"))
	return metadata

static func build_payload(root: Node, aspect_key: String) -> Dictionary:
	var res = root.get_viewport().get_visible_rect().size
	return {
		"viewport": {
			"width": res.x,
			"height": res.y,
			"aspectRatio": _actual_aspect_key(res, aspect_key)
		},
		"nodes": collect_ui_nodes(root)
	}

static func _actual_aspect_key(size: Vector2, fallback: String) -> String:
	if size.y <= 0:
		return fallback
	for key in ASPECT_RATIOS:
		var candidate: Vector2 = ASPECT_RATIOS[key]
		if absf(size.x / size.y - candidate.x / candidate.y) < 0.001:
			return key
	return str(int(size.x)) + ":" + str(int(size.y))
