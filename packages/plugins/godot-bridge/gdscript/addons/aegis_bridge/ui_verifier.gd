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
			"rect": {
				"x": rect.position.x,
				"y": rect.position.y,
				"width": rect.size.x,
				"height": rect.size.y
			}
		}
		if "text" in node and node.get("text") != null:
			node_info["text"] = str(node.get("text"))
		if "disabled" in node:
			node_info["disabled"] = bool(node.get("disabled"))
		acc.append(node_info)
	for child in node.get_children():
		_traverse_control_tree(child, acc)

static func build_payload(root: Node, aspect_key: String) -> Dictionary:
	var res = ASPECT_RATIOS.get(aspect_key, Vector2(1920, 1080))
	return {
		"viewport": {
			"width": res.x,
			"height": res.y,
			"aspectRatio": aspect_key
		},
		"nodes": collect_ui_nodes(root)
	}
