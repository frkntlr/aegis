@tool
extends Node

const AegisUiVerifier = preload("res://addons/aegis_bridge/ui_verifier.gd")
const AegisSyntheticPlayer = preload("res://addons/aegis_bridge/synthetic_player.gd")

const DEFAULT_PORT = 6850
var port: int = DEFAULT_PORT
var session_token: String = ""
var ws: WebSocketPeer = WebSocketPeer.new()
var is_connected_ws: bool = false
var reconnect_timer: float = 0.0

func _ready() -> void:
	_parse_cmdline_args()
	_connect_to_server()
	print("[AegisBridge] Client initializing on port: ", port)
	_capture_initial_telemetry()

func _parse_cmdline_args() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--aegis-port="):
			port = int(arg.replace("--aegis-port=", ""))
		elif arg.begins_with("--aegis-token="):
			session_token = arg.replace("--aegis-token=", "")

func _connect_to_server() -> void:
	var url = "ws://127.0.0.1:" + str(port) + "/?token=" + session_token
	var err = ws.connect_to_url(url)
	if err != OK:
		push_warning("[AegisBridge] Failed to initiate WebSocket connection: " + str(err))

func _process(delta: float) -> void:
	ws.poll()
	var state = ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not is_connected_ws:
			is_connected_ws = true
			print("[AegisBridge] WebSocket connected with sub-millisecond bridge.")
		while ws.get_available_packet_count() > 0:
			var pkt = ws.get_packet()
			_handle_packet(pkt.get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED:
		is_connected_ws = false
		reconnect_timer += delta
		if reconnect_timer >= 2.0:
			reconnect_timer = 0.0
			_connect_to_server()

func _capture_initial_telemetry() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var p = AegisUiVerifier.build_payload(get_tree().root, "16:9")
	send_telemetry(p)

func send_telemetry(payload: Dictionary) -> void:
	_save_telemetry_snapshot(JSON.stringify(payload))
	if is_connected_ws:
		var msg = { "type": "telemetry", "payload": payload }
		ws.send_text(JSON.stringify(msg))

func _save_telemetry_snapshot(json: String) -> void:
	var dir = DirAccess.open("res://")
	if dir and not dir.dir_exists(".aegis"):
		dir.make_dir(".aegis")
	var file = FileAccess.open("res://.aegis/ui_telemetry.json", FileAccess.WRITE)
	if file:
		file.store_string(json)
		file.close()

func _handle_packet(text: String) -> void:
	var json = JSON.parse_string(text)
	if json is Dictionary:
		_execute_command(json)

func _execute_command(cmd: Dictionary) -> void:
	var cmd_id = str(cmd.get("id", "0"))
	var action = str(cmd.get("action", ""))
	var payload = cmd.get("payload", {})
	var resp_data = { "acknowledged": true, "action": action }

	if action == "get_ui_tree":
		var p = AegisUiVerifier.build_payload(get_tree().root, "16:9")
		send_telemetry(p)
		resp_data["nodes_count"] = p.get("nodes", []).size()
	elif action == "simulate_input":
		var actions = payload.get("actions", [])
		var player = AegisSyntheticPlayer.new()
		add_child(player)
		var res = await player.execute_scenario(actions)
		player.queue_free()
		resp_data["result"] = res
	elif action == "eval":
		resp_data["eval_result"] = _evaluate_expression(str(payload.get("expr", "")))
	elif action == "ping":
		resp_data["pong"] = true

	_send_command_result(cmd_id, true, resp_data)

func _evaluate_expression(expr_str: String) -> Variant:
	var expression = Expression.new()
	var error = expression.parse(expr_str)
	if error != OK:
		return "PARSE_ERROR: " + expression.get_error_text()
	var result = expression.execute([], self)
	if expression.has_execute_failed():
		return "EXEC_FAILED: " + expression.get_error_text()
	return result

func _send_command_result(cmd_id: String, success: bool, data: Dictionary) -> void:
	if is_connected_ws:
		var resp = { "id": cmd_id, "success": success, "data": data }
		ws.send_text(JSON.stringify(resp))
