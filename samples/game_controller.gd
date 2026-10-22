extends CharacterBody2D
class_name PlayerController

signal health_depleted
signal scored(points: int)

enum MovementState {
    IDLE,
    WALKING,
    RUNNING,
    JUMPING
}

const GRAVITY: float = 980.0
const JUMP_VELOCITY: float = -400.0

@export var max_health: int = 100
@export_range(100.0, 600.0) var movement_speed: float = 300.0
@onready var sprite: Sprite2D = $Sprite2D
@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var current_state: MovementState = MovementState.IDLE
var current_health: int = 100

func _ready() -> void:
    current_health = max_health
    sprite.play("idle")
    print("Player initialized with health: ", current_health)

func _physics_process(delta: float) -> void:
    if not is_on_floor():
        velocity.y += GRAVITY * delta
    var direction = Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * movement_speed
    else:
        velocity.x = move_toward(velocity.x, 0, movement_speed)
    move_and_slide()

static func calculate_fall_damage(fall_height: float) -> int:
    if fall_height < 50.0:
        return 0
    return int(fall_height * 0.5)
