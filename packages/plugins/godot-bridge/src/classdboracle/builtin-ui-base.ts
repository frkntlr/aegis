import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_UI_BASE: Record<string, ClassInfo> = {
  Control: {
    name: 'Control',
    inherits: 'CanvasItem',
    methods: [
      { name: 'grab_focus', returnType: 'void', arguments: [] },
      { name: 'release_focus', returnType: 'void', arguments: [] },
      { name: 'has_focus', returnType: 'bool', arguments: [] },
      { name: 'get_rect', returnType: 'Rect2', arguments: [] },
      { name: 'get_global_rect', returnType: 'Rect2', arguments: [] },
      { name: 'set_anchors_preset', returnType: 'void', arguments: [{ name: 'preset', type: 'int' }] },
      { name: 'set_offsets_preset', returnType: 'void', arguments: [{ name: 'preset', type: 'int' }] },
      { name: 'add_theme_color_override', returnType: 'void', arguments: [{ name: 'name', type: 'StringName' }, { name: 'color', type: 'Color' }] },
      { name: 'add_theme_stylebox_override', returnType: 'void', arguments: [{ name: 'name', type: 'StringName' }, { name: 'stylebox', type: 'StyleBox' }] },
      { name: 'add_theme_font_override', returnType: 'void', arguments: [{ name: 'name', type: 'StringName' }, { name: 'font', type: 'Font' }] },
      { name: 'add_theme_font_size_override', returnType: 'void', arguments: [{ name: 'name', type: 'StringName' }, { name: 'font_size', type: 'int' }] },
      { name: 'add_theme_constant_override', returnType: 'void', arguments: [{ name: 'name', type: 'StringName' }, { name: 'constant', type: 'int' }] },
      { name: 'get_theme_color', returnType: 'Color', arguments: [{ name: 'name', type: 'StringName' }] },
      { name: 'get_theme_stylebox', returnType: 'StyleBox', arguments: [{ name: 'name', type: 'StringName' }] },
      { name: 'get_theme_font', returnType: 'Font', arguments: [{ name: 'name', type: 'StringName' }] },
      { name: 'get_theme_font_size', returnType: 'int', arguments: [{ name: 'name', type: 'StringName' }] },
      { name: 'get_theme_constant', returnType: 'int', arguments: [{ name: 'name', type: 'StringName' }] }
    ],
    properties: [
      { name: 'size', type: 'Vector2' },
      { name: 'position', type: 'Vector2' },
      { name: 'custom_minimum_size', type: 'Vector2' },
      { name: 'layout_mode', type: 'int' },
      { name: 'layout_direction', type: 'int' },
      { name: 'anchors_preset', type: 'int' },
      { name: 'anchor_left', type: 'float' },
      { name: 'anchor_top', type: 'float' },
      { name: 'anchor_right', type: 'float' },
      { name: 'anchor_bottom', type: 'float' },
      { name: 'offset_left', type: 'float' },
      { name: 'offset_top', type: 'float' },
      { name: 'offset_right', type: 'float' },
      { name: 'offset_bottom', type: 'float' },
      { name: 'grow_horizontal', type: 'int' },
      { name: 'grow_vertical', type: 'int' },
      { name: 'size_flags_horizontal', type: 'int' },
      { name: 'size_flags_vertical', type: 'int' },
      { name: 'size_flags_stretch_ratio', type: 'float' },
      { name: 'auto_translate_mode', type: 'int' },
      { name: 'tooltip_text', type: 'String' },
      { name: 'focus_mode', type: 'int' },
      { name: 'mouse_filter', type: 'int' },
      { name: 'theme', type: 'Theme' },
      { name: 'theme_type_variation', type: 'StringName' },
      { name: 'accessibility_name', type: 'String' },
      { name: 'accessibility_description', type: 'String' }
    ],
    signals: [
      { name: 'resized', arguments: [] },
      { name: 'focus_entered', arguments: [] },
      { name: 'focus_exited', arguments: [] },
      { name: 'gui_input', arguments: [{ name: 'event', type: 'InputEvent' }] },
      { name: 'mouse_entered', arguments: [] },
      { name: 'mouse_exited', arguments: [] },
      { name: 'theme_changed', arguments: [] }
    ]
  },
  BaseButton: {
    name: 'BaseButton',
    inherits: 'Control',
    methods: [],
    properties: [
      { name: 'disabled', type: 'bool' },
      { name: 'toggle_mode', type: 'bool' },
      { name: 'button_pressed', type: 'bool' },
      { name: 'action_mode', type: 'int' }
    ],
    signals: [
      { name: 'pressed', arguments: [] },
      { name: 'button_up', arguments: [] },
      { name: 'button_down', arguments: [] },
      { name: 'toggled', arguments: [{ name: 'toggled_on', type: 'bool' }] }
    ]
  },
  Button: {
    name: 'Button',
    inherits: 'BaseButton',
    methods: [],
    properties: [
      { name: 'text', type: 'String' },
      { name: 'icon', type: 'Texture2D' },
      { name: 'flat', type: 'bool' },
      { name: 'alignment', type: 'int' }
    ],
    signals: []
  },
  TextureButton: {
    name: 'TextureButton',
    inherits: 'BaseButton',
    methods: [],
    properties: [
      { name: 'texture_normal', type: 'Texture2D' },
      { name: 'texture_pressed', type: 'Texture2D' },
      { name: 'texture_hover', type: 'Texture2D' },
      { name: 'texture_disabled', type: 'Texture2D' }
    ],
    signals: []
  },
  LinkButton: {
    name: 'LinkButton',
    inherits: 'BaseButton',
    methods: [],
    properties: [{ name: 'text', type: 'String' }, { name: 'uri', type: 'String' }],
    signals: []
  },
  CheckBox: {
    name: 'CheckBox',
    inherits: 'Button',
    methods: [],
    properties: [],
    signals: []
  },
  CheckButton: {
    name: 'CheckButton',
    inherits: 'Button',
    methods: [],
    properties: [],
    signals: []
  },
  OptionButton: {
    name: 'OptionButton',
    inherits: 'Button',
    methods: [
      { name: 'add_item', returnType: 'void', arguments: [{ name: 'label', type: 'String' }] },
      { name: 'get_item_count', returnType: 'int', arguments: [] },
      { name: 'get_item_text', returnType: 'String', arguments: [{ name: 'idx', type: 'int' }] },
      { name: 'clear', returnType: 'void', arguments: [] }
    ],
    properties: [{ name: 'selected', type: 'int' }, { name: 'item_count', type: 'int' }],
    signals: [{ name: 'item_selected', arguments: [{ name: 'index', type: 'int' }] }]
  },
  MenuButton: {
    name: 'MenuButton',
    inherits: 'Button',
    methods: [{ name: 'get_popup', returnType: 'PopupMenu', arguments: [] }],
    properties: [{ name: 'switch_on_hover', type: 'bool' }],
    signals: [{ name: 'about_to_popup', arguments: [] }]
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
      { name: 'vertical_alignment', type: 'int' },
      { name: 'autowrap_mode', type: 'int' }
    ],
    signals: []
  },
  RichTextLabel: {
    name: 'RichTextLabel',
    inherits: 'Control',
    methods: [
      { name: 'append_text', returnType: 'void', arguments: [{ name: 'bbcode', type: 'String' }] },
      { name: 'clear', returnType: 'void', arguments: [] }
    ],
    properties: [
      { name: 'text', type: 'String' },
      { name: 'bbcode_enabled', type: 'bool' },
      { name: 'fit_content', type: 'bool' },
      { name: 'scroll_active', type: 'bool' }
    ],
    signals: []
  }
};
