@tool
extends Node

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

func send_telemetry(payload: Dictionary) -> void:
	var url = "http://127.0.0.1:" + str(port) + "/telemetry"
	var headers = ["Content-Type: application/json"]
	var json = JSON.stringify(payload)
	http_request.request(url, headers, HTTPClient.METHOD_POST, json)

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
	var resp_data = { "acknowledged": true, "action": action }

	if action == "get_ui_tree":
		var p = AegisUiVerifier.build_payload(get_tree().root, "16:9")
		send_telemetry(p)
		resp_data["nodes_count"] = p.get("nodes", []).size()

	_post_command_result(cmd_id, true, resp_data)

func _post_command_result(cmd_id: String, success: bool, data: Dictionary) -> void:
	var url = "http://127.0.0.1:" + str(port) + "/command/result"
	var headers = ["Content-Type: application/json"]
	var body = JSON.stringify({ "id": cmd_id, "success": success, "data": data })
	result_request.request(url, headers, HTTPClient.METHOD_POST, body)

func _on_request_completed(_result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if response_code != 200:
		push_warning("[AegisBridge] Server returned HTTP " + str(response_code))
