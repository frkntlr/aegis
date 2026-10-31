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
  },
  ScrollContainer: {
    name: 'ScrollContainer',
    inherits: 'Container',
    methods: [],
    properties: [{ name: 'horizontal_scroll_mode', type: 'int' }, { name: 'vertical_scroll_mode', type: 'int' }],
    signals: [{ name: 'scroll_started', arguments: [] }, { name: 'scroll_ended', arguments: [] }]
  },
  ProgressBar: {
    name: 'ProgressBar',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'value', type: 'float' }, { name: 'max_value', type: 'float' }, { name: 'show_percentage', type: 'bool' }],
    signals: [{ name: 'value_changed', arguments: [{ name: 'value', type: 'float' }] }]
  },
  TextureProgressBar: {
    name: 'TextureProgressBar',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'value', type: 'float' }, { name: 'texture_progress', type: 'Texture2D' }],
    signals: [{ name: 'value_changed', arguments: [{ name: 'value', type: 'float' }] }]
  },
  CheckBox: {
    name: 'CheckBox',
    inherits: 'Button',
    methods: [],
    properties: [{ name: 'button_pressed', type: 'bool' }],
    signals: [{ name: 'toggled', arguments: [{ name: 'toggled_on', type: 'bool' }] }]
  },
  CheckButton: {
    name: 'CheckButton',
    inherits: 'Button',
    methods: [],
    properties: [{ name: 'button_pressed', type: 'bool' }],
    signals: [{ name: 'toggled', arguments: [{ name: 'toggled_on', type: 'bool' }] }]
  },
  OptionButton: {
    name: 'OptionButton',
    inherits: 'Button',
    methods: [
      { name: 'add_item', returnType: 'void', arguments: [{ name: 'label', type: 'String' }] },
      { name: 'get_item_count', returnType: 'int', arguments: [] }
    ],
    properties: [{ name: 'selected', type: 'int' }],
    signals: [{ name: 'item_selected', arguments: [{ name: 'index', type: 'int' }] }]
  },
  HSlider: {
    name: 'HSlider',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'value', type: 'float' }, { name: 'min_value', type: 'float' }, { name: 'max_value', type: 'float' }],
    signals: [{ name: 'value_changed', arguments: [{ name: 'value', type: 'float' }] }]
  },
  VSlider: {
    name: 'VSlider',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'value', type: 'float' }, { name: 'min_value', type: 'float' }, { name: 'max_value', type: 'float' }],
    signals: [{ name: 'value_changed', arguments: [{ name: 'value', type: 'float' }] }]
  },
  TabContainer: {
    name: 'TabContainer',
    inherits: 'Container',
    methods: [],
    properties: [{ name: 'current_tab', type: 'int' }],
    signals: [{ name: 'tab_changed', arguments: [{ name: 'tab', type: 'int' }] }, { name: 'tab_selected', arguments: [{ name: 'tab', type: 'int' }] }]
  },
  Panel: {
    name: 'Panel',
    inherits: 'Control',
    methods: [],
    properties: [],
    signals: []
  },
  NinePatchRect: {
    name: 'NinePatchRect',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'texture', type: 'Texture2D' }, { name: 'patch_margin_left', type: 'int' }],
    signals: []
  },
  CanvasLayer: {
    name: 'CanvasLayer',
    inherits: 'Node',
    methods: [],
    properties: [{ name: 'layer', type: 'int' }, { name: 'visible', type: 'bool' }],
    signals: []
  }
};
