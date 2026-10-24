# synthetic_player.gd
# Autonomous playtest runner and input simulator (Aegis RFC-002)
class_name AegisSyntheticPlayer
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
		await _dispatch_action(action)
		executed_actions += 1

	is_running = false
	return {
		"success": error_list.is_empty(),
		"executed_actions": executed_actions,
		"errors": error_list
	}

func _dispatch_action(action: Dictionary) -> void:
	var action_type: String = action.get("type", "")
	if action_type in ["key_press", "mouse_click", "click_node", "action", "action_press", "action_release"]:
		_dispatch_basic_input(action_type, action)
	elif action_type in ["touch_tap", "touch_drag", "type_text"]:
		_dispatch_touch_and_text(action_type, action)
	elif action_type in ["wait", "wait_frames"]:
		await _dispatch_wait(action_type, action)
	elif action_type in ["assert_node", "assert_text"]:
		_dispatch_assertion(action_type, action)
	else:
		error_list.append("Unknown action type: " + action_type)

func _dispatch_basic_input(action_type: String, action: Dictionary) -> void:
	match action_type:
		"key_press":
			_simulate_key(action.get("key", 0), true)
			_simulate_key(action.get("key", 0), false)
		"mouse_click":
			_simulate_click(action.get("position", Vector2.ZERO))
		"click_node":
			_click_node_at_path(action.get("path", ""))
		"action_press":
			_simulate_action(action.get("action", ""), true)
		"action_release":
			_simulate_action(action.get("action", ""), false)
		"action":
			var act_name = action.get("action", "")
			_simulate_action(act_name, true)
			_simulate_action(act_name, false)

func _dispatch_touch_and_text(action_type: String, action: Dictionary) -> void:
	match action_type:
		"touch_tap":
			var pos: Vector2 = action.get("position", Vector2.ZERO)
			_simulate_touch(pos, true)
			_simulate_touch(pos, false)
		"touch_drag":
			var from_pos: Vector2 = action.get("from", Vector2.ZERO)
			var to_pos: Vector2 = action.get("to", Vector2.ZERO)
			_simulate_drag(from_pos, to_pos)
		"type_text":
			_simulate_type_text(str(action.get("text", "")))

func _dispatch_wait(action_type: String, action: Dictionary) -> void:
	if action_type == "wait":
		var duration = float(action.get("duration", 0.1))
		if duration > 0.0:
			await get_tree().create_timer(duration).timeout
	elif action_type == "wait_frames":
		var f_count = int(action.get("frames", 1))
		for _f in range(f_count):
			await get_tree().process_frame

func _dispatch_assertion(action_type: String, action: Dictionary) -> void:
	var path_str = str(action.get("path", ""))
	var target = get_tree().root.get_node_or_null(path_str)
	if action_type == "assert_node":
		if not target:
			error_list.append("Assertion failed: node not found: " + path_str)
	elif action_type == "assert_text":
		var expected = str(action.get("expected", ""))
		if not target:
			error_list.append("Assertion failed: node not found for text check: " + path_str)
		elif not ("text" in target) or str(target.get("text")) != expected:
			error_list.append("Assertion failed: expected text '" + expected + "', got: " + (str(target.get("text")) if target and "text" in target else "null"))

func _simulate_type_text(text: String) -> void:
	for i in range(text.length()):
		var ev = InputEventKey.new()
		ev.unicode = text.unicode_at(i)
		ev.pressed = true
		Input.parse_input_event(ev)
		var ev_rel = InputEventKey.new()
		ev_rel.unicode = text.unicode_at(i)
		ev_rel.pressed = false
		Input.parse_input_event(ev_rel)

func _simulate_action(action_name: String, is_pressed: bool) -> void:
	if action_name.is_empty():
		return
	if is_pressed:
		Input.action_press(action_name)
	else:
		Input.action_release(action_name)

func _simulate_touch(pos: Vector2, is_pressed: bool, index: int = 0) -> void:
	var touch = InputEventScreenTouch.new()
	touch.position = pos
	touch.pressed = is_pressed
	touch.index = index
	Input.parse_input_event(touch)

func _simulate_drag(from_pos: Vector2, to_pos: Vector2, index: int = 0) -> void:
	_simulate_touch(from_pos, true, index)
	var drag = InputEventScreenDrag.new()
	drag.position = to_pos
	drag.relative = to_pos - from_pos
	drag.index = index
	Input.parse_input_event(drag)
	_simulate_touch(to_pos, false, index)

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
