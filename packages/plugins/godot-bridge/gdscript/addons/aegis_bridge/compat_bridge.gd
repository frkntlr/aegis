@tool
class_name AegisCompatBridge
extends RefCounted

static func get_major_version() -> int:
	var info = Engine.get_version_info()
	return int(info.get("major", 4))

static func instantiate_packed_scene(scene: PackedScene) -> Node:
	if get_major_version() == 3:
		return scene.call("instance")
	return scene.instantiate()

static func get_viewport_rect(node: CanvasItem) -> Rect2:
	if node == null:
		return Rect2()
	return node.get_viewport_rect()

static func safe_queue_free(node: Node) -> void:
	if is_instance_valid(node):
		node.queue_free()
