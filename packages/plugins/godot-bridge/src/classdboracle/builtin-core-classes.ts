import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_CORE_CLASSES: Record<string, ClassInfo> = {
  Object: {
    name: 'Object',
    methods: [
      { name: 'free', returnType: 'void', arguments: [] },
      { name: 'get_class', returnType: 'String', arguments: [] },
      { name: 'is_class', returnType: 'bool', arguments: [{ name: 'type', type: 'String' }] },
      { name: 'connect', returnType: 'int', arguments: [{ name: 'signal', type: 'String' }, { name: 'callable', type: 'Callable' }] },
      { name: 'disconnect', returnType: 'void', arguments: [{ name: 'signal', type: 'String' }, { name: 'callable', type: 'Callable' }] },
      { name: 'emit_signal', returnType: 'int', arguments: [{ name: 'signal', type: 'String' }] }
    ],
    properties: [],
    signals: [{ name: 'script_changed', arguments: [] }]
  },
  Node: {
    name: 'Node',
    inherits: 'Object',
    methods: [
      { name: 'add_child', returnType: 'void', arguments: [{ name: 'node', type: 'Node' }] },
      { name: 'remove_child', returnType: 'void', arguments: [{ name: 'node', type: 'Node' }] },
      { name: 'get_node', returnType: 'Node', arguments: [{ name: 'path', type: 'NodePath' }] },
      { name: 'get_parent', returnType: 'Node', arguments: [] },
      { name: 'queue_free', returnType: 'void', arguments: [] },
      { name: 'get_tree', returnType: 'SceneTree', arguments: [] },
      { name: '_ready', returnType: 'void', arguments: [] },
      { name: '_process', returnType: 'void', arguments: [{ name: 'delta', type: 'float' }] },
      { name: '_physics_process', returnType: 'void', arguments: [{ name: 'delta', type: 'float' }] }
    ],
    properties: [
      { name: 'name', type: 'String' },
      { name: 'process_mode', type: 'int' }
    ],
    signals: [
      { name: 'ready', arguments: [] },
      { name: 'tree_entered', arguments: [] },
      { name: 'tree_exited', arguments: [] }
    ]
  },
  CanvasItem: {
    name: 'CanvasItem',
    inherits: 'Node',
    methods: [
      { name: 'show', returnType: 'void', arguments: [] },
      { name: 'hide', returnType: 'void', arguments: [] },
      { name: 'queue_redraw', returnType: 'void', arguments: [] }
    ],
    properties: [
      { name: 'visible', type: 'bool' },
      { name: 'modulate', type: 'Color' }
    ],
    signals: [{ name: 'draw', arguments: [] }, { name: 'visibility_changed', arguments: [] }]
  },
  Node2D: {
    name: 'Node2D',
    inherits: 'CanvasItem',
    methods: [
      { name: 'look_at', returnType: 'void', arguments: [{ name: 'point', type: 'Vector2' }] },
      { name: 'rotate', returnType: 'void', arguments: [{ name: 'radians', type: 'float' }] }
    ],
    properties: [
      { name: 'position', type: 'Vector2' },
      { name: 'rotation', type: 'float' },
      { name: 'scale', type: 'Vector2' }
    ],
    signals: []
  },
  CharacterBody2D: {
    name: 'CharacterBody2D',
    inherits: 'Node2D',
    methods: [
      { name: 'move_and_slide', returnType: 'bool', arguments: [] },
      { name: 'is_on_floor', returnType: 'bool', arguments: [] },
      { name: 'is_on_wall', returnType: 'bool', arguments: [] }
    ],
    properties: [
      { name: 'velocity', type: 'Vector2' },
      { name: 'motion_mode', type: 'int' }
    ],
    signals: []
  },
  RefCounted: {
    name: 'RefCounted',
    inherits: 'Object',
    methods: [
      { name: 'get_reference_count', returnType: 'int', arguments: [] },
      { name: 'reference', returnType: 'bool', arguments: [] },
      { name: 'unreference', returnType: 'bool', arguments: [] }
    ],
    properties: [],
    signals: []
  },
  Resource: {
    name: 'Resource',
    inherits: 'RefCounted',
    methods: [
      { name: 'duplicate', returnType: 'Resource', arguments: [{ name: 'subresources', type: 'bool' }] }
    ],
    properties: [
      { name: 'resource_name', type: 'String' },
      { name: 'resource_path', type: 'String' }
    ],
    signals: [{ name: 'changed', arguments: [] }]
  },
  Timer: {
    name: 'Timer',
    inherits: 'Node',
    methods: [
      { name: 'start', returnType: 'void', arguments: [{ name: 'time_sec', type: 'float' }] },
      { name: 'stop', returnType: 'void', arguments: [] }
    ],
    properties: [
      { name: 'wait_time', type: 'float' },
      { name: 'one_shot', type: 'bool' },
      { name: 'autostart', type: 'bool' }
    ],
    signals: [{ name: 'timeout', arguments: [] }]
  },
  AudioStreamPlayer: {
    name: 'AudioStreamPlayer',
    inherits: 'Node',
    methods: [
      { name: 'play', returnType: 'void', arguments: [{ name: 'from_position', type: 'float' }] },
      { name: 'stop', returnType: 'void', arguments: [] },
      { name: 'seek', returnType: 'void', arguments: [{ name: 'to_position', type: 'float' }] }
    ],
    properties: [
      { name: 'stream', type: 'AudioStream' },
      { name: 'volume_db', type: 'float' },
      { name: 'pitch_scale', type: 'float' },
      { name: 'playing', type: 'bool' }
    ],
    signals: [{ name: 'finished', arguments: [] }]
  },
  Sprite2D: {
    name: 'Sprite2D',
    inherits: 'Node2D',
    methods: [],
    properties: [
      { name: 'texture', type: 'Texture2D' },
      { name: 'hframes', type: 'int' },
      { name: 'vframes', type: 'int' },
      { name: 'frame', type: 'int' }
    ],
    signals: [{ name: 'frame_changed', arguments: [] }, { name: 'texture_changed', arguments: [] }]
  },
  AnimationPlayer: {
    name: 'AnimationPlayer',
    inherits: 'Node',
    methods: [
      { name: 'play', returnType: 'void', arguments: [{ name: 'name', type: 'String' }] },
      { name: 'pause', returnType: 'void', arguments: [] },
      { name: 'stop', returnType: 'void', arguments: [] }
    ],
    properties: [{ name: 'current_animation', type: 'String' }],
    signals: [{ name: 'animation_finished', arguments: [{ name: 'anim_name', type: 'String' }] }]
  },
  Tween: {
    name: 'Tween',
    inherits: 'RefCounted',
    methods: [
      { name: 'tween_property', returnType: 'Variant', arguments: [{ name: 'object', type: 'Object' }, { name: 'property', type: 'NodePath' }, { name: 'final_val', type: 'Variant' }, { name: 'duration', type: 'float' }] },
      { name: 'tween_interval', returnType: 'Variant', arguments: [{ name: 'time', type: 'float' }] },
      { name: 'tween_callback', returnType: 'Variant', arguments: [{ name: 'callable', type: 'Callable' }] },
      { name: 'play', returnType: 'void', arguments: [] },
      { name: 'stop', returnType: 'void', arguments: [] },
      { name: 'kill', returnType: 'void', arguments: [] }
    ],
    properties: [],
    signals: [{ name: 'finished', arguments: [] }]
  },
  SceneTree: {
    name: 'SceneTree',
    inherits: 'Object',
    methods: [
      { name: 'change_scene_to_file', returnType: 'int', arguments: [{ name: 'path', type: 'String' }] },
      { name: 'reload_current_scene', returnType: 'int', arguments: [] },
      { name: 'create_timer', returnType: 'Variant', arguments: [{ name: 'time_sec', type: 'float' }] },
      { name: 'create_tween', returnType: 'Tween', arguments: [] },
      { name: 'quit', returnType: 'void', arguments: [] }
    ],
    properties: [{ name: 'paused', type: 'bool' }],
    signals: []
  }
};
