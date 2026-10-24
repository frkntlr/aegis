import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_UI_CLASSES: Record<string, ClassInfo> = {
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
  Label: {
    name: 'Label',
    inherits: 'Control',
    methods: [
      { name: 'set_text', returnType: 'void', arguments: [{ name: 'text', type: 'String' }] },
      { name: 'get_text', returnType: 'String', arguments: [] }
    ],
    properties: [
      { name: 'text', type: 'String' },
      { name: 'horizontal_alignment', type: 'int' },
      { name: 'vertical_alignment', type: 'int' }
    ],
    signals: []
  },
  Container: {
    name: 'Container',
    inherits: 'Control',
    methods: [
      { name: 'fit_child_in_rect', returnType: 'void', arguments: [{ name: 'child', type: 'Control' }, { name: 'rect', type: 'Rect2' }] },
      { name: 'queue_sort', returnType: 'void', arguments: [] }
    ],
    properties: [],
    signals: [{ name: 'sort_children', arguments: [] }]
  },
  BoxContainer: {
    name: 'BoxContainer',
    inherits: 'Container',
    methods: [
      { name: 'add_spacer', returnType: 'Control', arguments: [{ name: 'begin', type: 'bool' }] }
    ],
    properties: [{ name: 'alignment', type: 'int' }, { name: 'vertical', type: 'bool' }],
    signals: []
  },
  VBoxContainer: {
    name: 'VBoxContainer',
    inherits: 'BoxContainer',
    methods: [],
    properties: [],
    signals: []
  },
  HBoxContainer: {
    name: 'HBoxContainer',
    inherits: 'BoxContainer',
    methods: [],
    properties: [],
    signals: []
  },
  GridContainer: {
    name: 'GridContainer',
    inherits: 'Container',
    methods: [],
    properties: [{ name: 'columns', type: 'int' }],
    signals: []
  },
  PanelContainer: {
    name: 'PanelContainer',
    inherits: 'Container',
    methods: [],
    properties: [],
    signals: []
  },
  FlowContainer: {
    name: 'FlowContainer',
    inherits: 'Container',
    methods: [],
    properties: [{ name: 'alignment', type: 'int' }],
    signals: []
  },
  HFlowContainer: {
    name: 'HFlowContainer',
    inherits: 'FlowContainer',
    methods: [],
    properties: [],
    signals: []
  },
  TextureRect: {
    name: 'TextureRect',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'texture', type: 'Texture2D' }, { name: 'expand_mode', type: 'int' }],
    signals: []
  },
  ColorRect: {
    name: 'ColorRect',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'color', type: 'Color' }],
    signals: []
  },
  MarginContainer: {
    name: 'MarginContainer',
    inherits: 'Container',
    methods: [],
    properties: [],
    signals: []
  },
  LineEdit: {
    name: 'LineEdit',
    inherits: 'Control',
    methods: [{ name: 'clear', returnType: 'void', arguments: [] }],
    properties: [{ name: 'text', type: 'String' }, { name: 'placeholder_text', type: 'String' }],
    signals: [{ name: 'text_changed', arguments: [] }, { name: 'text_submitted', arguments: [] }]
  },
  RichTextLabel: {
    name: 'RichTextLabel',
    inherits: 'Control',
    methods: [
      { name: 'append_text', returnType: 'void', arguments: [{ name: 'bbcode', type: 'String' }] },
      { name: 'clear', returnType: 'void', arguments: [] }
    ],
    properties: [{ name: 'text', type: 'String' }, { name: 'bbcode_enabled', type: 'bool' }],
    signals: []
  }
};
