@tool
extends EditorPlugin

var _client: Node = null

func _enter_tree() -> void:
	print("[Aegis] Initializing Aegis Godot Bridge Plugin...")
	add_autoload_singleton("AegisBridge", "res://addons/aegis_bridge/aegis_client.gd")

func _exit_tree() -> void:
	print("[Aegis] Disabling Aegis Godot Bridge Plugin...")
	remove_autoload_singleton("AegisBridge")
