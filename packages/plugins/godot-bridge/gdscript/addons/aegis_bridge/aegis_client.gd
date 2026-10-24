@tool
extends Node

const DEFAULT_PORT = 6850
var port: int = DEFAULT_PORT
var http_request: HTTPRequest

func _ready() -> void:
	http_request = HTTPRequest.new()
	add_child(http_request)
	http_request.request_completed.connect(_on_request_completed)
	print("[AegisBridge] Client ready on port: ", port)

func send_telemetry(payload: Dictionary) -> void:
	var url = "http://127.0.0.1:" + str(port) + "/telemetry"
	var headers = ["Content-Type: application/json"]
	var json = JSON.stringify(payload)
	http_request.request(url, headers, HTTPClient.METHOD_POST, json)

func _on_request_completed(_result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if response_code != 200:
		push_warning("[AegisBridge] Server returned HTTP " + str(response_code))
