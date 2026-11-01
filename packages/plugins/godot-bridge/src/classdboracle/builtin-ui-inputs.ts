import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_UI_INPUTS: Record<string, ClassInfo> = {
  Range: {
    name: 'Range',
    inherits: 'Control',
    methods: [
      { name: 'set_value_no_signal', returnType: 'void', arguments: [{ name: 'value', type: 'float' }] }
    ],
    properties: [
      { name: 'min_value', type: 'float' },
      { name: 'max_value', type: 'float' },
      { name: 'step', type: 'float' },
      { name: 'page', type: 'float' },
      { name: 'value', type: 'float' },
      { name: 'ratio', type: 'float' }
    ],
    signals: [
      { name: 'value_changed', arguments: [{ name: 'value', type: 'float' }] },
      { name: 'changed', arguments: [] }
    ]
  },
  ProgressBar: {
    name: 'ProgressBar',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'show_percentage', type: 'bool' }, { name: 'indeterminate', type: 'bool' }],
    signals: []
  },
  TextureProgressBar: {
    name: 'TextureProgressBar',
    inherits: 'Range',
    methods: [],
    properties: [
      { name: 'fill_mode', type: 'int' },
      { name: 'texture_under', type: 'Texture2D' },
      { name: 'texture_over', type: 'Texture2D' },
      { name: 'texture_progress', type: 'Texture2D' }
    ],
    signals: []
  },
  Slider: {
    name: 'Slider',
    inherits: 'Range',
    methods: [],
    properties: [{ name: 'editable', type: 'bool' }, { name: 'scrollable', type: 'bool' }, { name: 'tick_count', type: 'int' }],
    signals: [{ name: 'drag_started', arguments: [] }, { name: 'drag_ended', arguments: [{ name: 'value_changed', type: 'bool' }] }]
  },
  HSlider: {
    name: 'HSlider',
    inherits: 'Slider',
    methods: [],
    properties: [],
    signals: []
  },
  VSlider: {
    name: 'VSlider',
    inherits: 'Slider',
    methods: [],
    properties: [],
    signals: []
  },
  SpinBox: {
    name: 'SpinBox',
    inherits: 'Range',
    methods: [{ name: 'get_line_edit', returnType: 'LineEdit', arguments: [] }],
    properties: [{ name: 'alignment', type: 'int' }, { name: 'editable', type: 'bool' }, { name: 'prefix', type: 'String' }, { name: 'suffix', type: 'String' }],
    signals: []
  },
  LineEdit: {
    name: 'LineEdit',
    inherits: 'Control',
    methods: [
      { name: 'clear', returnType: 'void', arguments: [] },
      { name: 'select_all', returnType: 'void', arguments: [] }
    ],
    properties: [
      { name: 'text', type: 'String' },
      { name: 'placeholder_text', type: 'String' },
      { name: 'alignment', type: 'int' },
      { name: 'max_length', type: 'int' },
      { name: 'editable', type: 'bool' },
      { name: 'secret', type: 'bool' }
    ],
    signals: [
      { name: 'text_changed', arguments: [{ name: 'new_text', type: 'String' }] },
      { name: 'text_submitted', arguments: [{ name: 'new_text', type: 'String' }] }
    ]
  },
  TextEdit: {
    name: 'TextEdit',
    inherits: 'Control',
    methods: [
      { name: 'clear', returnType: 'void', arguments: [] },
      { name: 'get_line_count', returnType: 'int', arguments: [] }
    ],
    properties: [{ name: 'text', type: 'String' }, { name: 'placeholder_text', type: 'String' }, { name: 'editable', type: 'bool' }, { name: 'wrap_mode', type: 'int' }],
    signals: [{ name: 'text_changed', arguments: [] }]
  },
  CodeEdit: {
    name: 'CodeEdit',
    inherits: 'TextEdit',
    methods: [],
    properties: [{ name: 'symbol_lookup_on_click', type: 'bool' }, { name: 'line_folding', type: 'bool' }],
    signals: []
  },
  Panel: {
    name: 'Panel',
    inherits: 'Control',
    methods: [],
    properties: [],
    signals: []
  },
  TextureRect: {
    name: 'TextureRect',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'texture', type: 'Texture2D' }, { name: 'expand_mode', type: 'int' }, { name: 'stretch_mode', type: 'int' }],
    signals: []
  },
  ColorRect: {
    name: 'ColorRect',
    inherits: 'Control',
    methods: [],
    properties: [{ name: 'color', type: 'Color' }],
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
  },
  Tree: {
    name: 'Tree',
    inherits: 'Control',
    methods: [{ name: 'create_item', returnType: 'TreeItem', arguments: [] }, { name: 'clear', returnType: 'void', arguments: [] }],
    properties: [{ name: 'columns', type: 'int' }, { name: 'hide_root', type: 'bool' }],
    signals: [{ name: 'item_selected', arguments: [] }, { name: 'item_activated', arguments: [] }]
  },
  ItemList: {
    name: 'ItemList',
    inherits: 'Control',
    methods: [{ name: 'add_item', returnType: 'int', arguments: [{ name: 'text', type: 'String' }] }, { name: 'clear', returnType: 'void', arguments: [] }],
    properties: [{ name: 'select_mode', type: 'int' }, { name: 'item_count', type: 'int' }],
    signals: [{ name: 'item_selected', arguments: [{ name: 'index', type: 'int' }] }]
  }
};
