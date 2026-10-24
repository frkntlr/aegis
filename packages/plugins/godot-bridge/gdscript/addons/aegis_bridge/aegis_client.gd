@tool
extends Node

const AegisUiVerifier = preload("res://addons/aegis_bridge/ui_verifier.gd")
const AegisSyntheticPlayer = preload("res://addons/aegis_bridge/synthetic_player.gd")

const DEFAULT_PORT = 6850
var port: int = DEFAULT_PORT
var http_request: HTTPRequest
var poll_request: HTTPRequest
var result_request: HTTPRequest
var poll_timer: Timer

func _ready() -> void:
	http_request = HTTPRequest.new()
	add_child(http_request)
	http_request.request_completed.connect(_on_request_completed)

	poll_request = HTTPRequest.new()
	add_child(poll_request)
	poll_request.request_completed.connect(_on_poll_completed)

	result_request = HTTPRequest.new()
	add_child(result_request)

	poll_timer = Timer.new()
	poll_timer.wait_time = 0.5
	poll_timer.autostart = true
	poll_timer.timeout.connect(_on_poll_timer)
	add_child(poll_timer)

	print("[AegisBridge] Client ready on port: ", port)
	_capture_initial_telemetry()

func _capture_initial_telemetry() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var p = AegisUiVerifier.build_payload(get_tree().root, "16:9")
	_save_telemetry_snapshot(JSON.stringify(p))

func send_telemetry(payload: Dictionary) -> void:
	var url = "http://127.0.0.1:" + str(port) + "/telemetry"
	var headers = ["Content-Type: application/json"]
	var json = JSON.stringify(payload)
	_save_telemetry_snapshot(json)
	http_request.request(url, headers, HTTPClient.METHOD_POST, json)

func _save_telemetry_snapshot(json: String) -> void:
	var dir = DirAccess.open("res://")
	if dir and not dir.dir_exists(".aegis"):
		dir.make_dir(".aegis")
	var file = FileAccess.open("res://.aegis/ui_telemetry.json", FileAccess.WRITE)
	if file:
		file.store_string(json)
		file.close()

func _on_poll_timer() -> void:
	if poll_request.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
		var url = "http://127.0.0.1:" + str(port) + "/command/poll"
		poll_request.request(url)

func _on_poll_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code != 200 or body.is_empty():
		return
	var text = body.get_string_from_utf8()
	var json = JSON.parse_string(text)
	if json is Dictionary and json.has("command") and json["command"] is Dictionary:
		_execute_command(json["command"])

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
	elif action == "ping":
		resp_data["pong"] = true

	_post_command_result(cmd_id, true, resp_data)

func _post_command_result(cmd_id: String, success: bool, data: Dictionary) -> void:
	var url = "http://127.0.0.1:" + str(port) + "/command/result"
	var headers = ["Content-Type: application/json"]
	var body = JSON.stringify({ "id": cmd_id, "success": success, "data": data })
	result_request.request(url, headers, HTTPClient.METHOD_POST, body)

func _on_request_completed(_result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if response_code != 200:
		push_warning("[AegisBridge] Server returned HTTP " + str(response_code))
