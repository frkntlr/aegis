@tool
class_name AegisSyntheticPlayer
extends Node

## Synthetic Player Harness (Autonomous Playtester Stub - RFC-002 Phase 2)
## This harness executes automated headless playtesting scenarios,
## simulating input actions and recording unexpected regressions.

@export var autonomous_mode: bool = false
@export var scenario_timeout_seconds: float = 30.0

var _running_scenario: String = ""
var _elapsed: float = 0.0

func start_scenario(scenario_name: String) -> void:
	_running_scenario = scenario_name
	_elapsed = 0.0
	print("[SyntheticPlayer] Starting stub scenario: ", scenario_name)

func step(delta: float) -> void:
	if _running_scenario.is_empty():
		return
	_elapsed += delta
	if _elapsed > scenario_timeout_seconds:
		print("[SyntheticPlayer] Scenario timed out: ", _running_scenario)
		_running_scenario = ""

func simulate_key_action(_action: String, _pressed: bool) -> void:
	# Stub: to be fully implemented in Phase 2
	pass
