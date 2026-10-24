# synthetic_player.gd
# Autonomous playtest runner and input simulator (Aegis RFC-002)
extends Node

const MAX_FRAMES_LIMIT: int = 1200

var is_running: bool = false
var executed_actions: int = 0
var error_list: Array = []

func execute_scenario(actions: Array) -> Dictionary:
	if is_running:
		return { "success": false, "error": "Scenario already running." }
	is_running = true
	executed_actions = 0
	error_list.clear()

	for action in actions:
		if executed_actions >= MAX_FRAMES_LIMIT:
			error_list.append("Maximum action limit reached.")
			break
		_dispatch_action(action)
		executed_actions += 1

	is_running = false
	return {
		"success": error_list.is_empty(),
		"executed_actions": executed_actions,
		"errors": error_list
	}

func _dispatch_action(action: Dictionary) -> void:
	var action_type: String = action.get("type", "")
	match action_type:
		"key_press":
			_simulate_key(action.get("key", 0), true)
			_simulate_key(action.get("key", 0), false)
		"mouse_click":
			var pos: Vector2 = action.get("position", Vector2.ZERO)
			_simulate_click(pos)
		"click_node":
			_click_node_at_path(action.get("path", ""))
		_:
			error_list.append("Unknown action type: " + action_type)

func _simulate_key(keycode: int, is_pressed: bool) -> void:
	var ev = InputEventKey.new()
	if "keycode" in ev:
		ev.keycode = keycode
	elif "scancode" in ev:
		ev.set("scancode", keycode)
	ev.pressed = is_pressed
	Input.parse_input_event(ev)

func _simulate_click(pos: Vector2) -> void:
	var press = InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT if "MOUSE_BUTTON_LEFT" in self else 1
	press.position = pos
	press.pressed = true
	Input.parse_input_event(press)

	var release = InputEventMouseButton.new()
	release.button_index = press.button_index
	release.position = pos
	release.pressed = false
	Input.parse_input_event(release)

func _click_node_at_path(node_path: String) -> void:
	var target = get_tree().root.get_node_or_null(node_path)
	if target and target is Control:
		var rect: Rect2 = target.get_global_rect()
		var center = rect.position + (rect.size / 2.0)
		_simulate_click(center)
	else:
		error_list.append("Target control not found: " + node_path)
