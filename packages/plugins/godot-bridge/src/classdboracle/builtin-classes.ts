import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_GODOT_CLASSES: Record<string, ClassInfo> = {
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
  Control: {
    name: 'Control',
    inherits: 'CanvasItem',
    methods: [
      { name: 'grab_focus', returnType: 'void', arguments: [] },
      { name: 'get_rect', returnType: 'Rect2', arguments: [] }
    ],
    properties: [
      { name: 'size', type: 'Vector2' },
      { name: 'position', type: 'Vector2' },
      { name: 'mouse_filter', type: 'int' }
    ],
    signals: [{ name: 'resized', arguments: [] }, { name: 'focus_entered', arguments: [] }, { name: 'focus_exited', arguments: [] }]
  },
  Button: {
    name: 'Button',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'text', type: 'String' }, { name: 'disabled', type: 'bool' }],
    signals: [{ name: 'pressed', arguments: [] }, { name: 'button_up', arguments: [] }, { name: 'button_down', arguments: [] }]
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
  }
};
