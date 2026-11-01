import type { ClassInfo } from './classdb-types.js';

export const BUILTIN_UI_CONTAINERS: Record<string, ClassInfo> = {
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
    properties: [
      { name: 'alignment', type: 'int' },
      { name: 'vertical', type: 'bool' }
    ],
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
  MarginContainer: {
    name: 'MarginContainer',
    inherits: 'Container',
    methods: [],
    properties: [],
    signals: []
  },
  CenterContainer: {
    name: 'CenterContainer',
    inherits: 'Container',
    methods: [],
    properties: [{ name: 'use_top_left', type: 'bool' }],
    signals: []
  },
  ScrollContainer: {
    name: 'ScrollContainer',
    inherits: 'Container',
    methods: [
      { name: 'ensure_control_visible', returnType: 'void', arguments: [{ name: 'control', type: 'Control' }] },
      { name: 'get_h_scroll_bar', returnType: 'HScrollBar', arguments: [] },
      { name: 'get_v_scroll_bar', returnType: 'VScrollBar', arguments: [] }
    ],
    properties: [
      { name: 'horizontal_scroll_mode', type: 'int' },
      { name: 'vertical_scroll_mode', type: 'int' },
      { name: 'scroll_horizontal', type: 'int' },
      { name: 'scroll_vertical', type: 'int' },
      { name: 'scroll_horizontal_custom_step', type: 'float' },
      { name: 'scroll_vertical_custom_step', type: 'float' }
    ],
    signals: [{ name: 'scroll_started', arguments: [] }, { name: 'scroll_ended', arguments: [] }]
  },
  AspectRatioContainer: {
    name: 'AspectRatioContainer',
    inherits: 'Container',
    methods: [],
    properties: [
      { name: 'ratio', type: 'float' },
      { name: 'stretch_mode', type: 'int' },
      { name: 'alignment_horizontal', type: 'int' },
      { name: 'alignment_vertical', type: 'int' }
    ],
    signals: []
  },
  FlowContainer: {
    name: 'FlowContainer',
    inherits: 'Container',
    methods: [{ name: 'get_line_count', returnType: 'int', arguments: [] }],
    properties: [
      { name: 'alignment', type: 'int' },
      { name: 'vertical', type: 'bool' },
      { name: 'reverse_fill', type: 'bool' }
    ],
    signals: []
  },
  HFlowContainer: {
    name: 'HFlowContainer',
    inherits: 'FlowContainer',
    methods: [],
    properties: [],
    signals: []
  },
  VFlowContainer: {
    name: 'VFlowContainer',
    inherits: 'FlowContainer',
    methods: [],
    properties: [],
    signals: []
  },
  SplitContainer: {
    name: 'SplitContainer',
    inherits: 'Container',
    methods: [
      { name: 'clamp_split_offset', returnType: 'void', arguments: [] }
    ],
    properties: [
      { name: 'split_offset', type: 'int' },
      { name: 'collapsed', type: 'bool' },
      { name: 'dragger_visibility', type: 'int' },
      { name: 'vertical', type: 'bool' }
    ],
    signals: [{ name: 'dragged', arguments: [{ name: 'offset', type: 'int' }] }]
  },
  HSplitContainer: {
    name: 'HSplitContainer',
    inherits: 'SplitContainer',
    methods: [],
    properties: [],
    signals: []
  },
  VSplitContainer: {
    name: 'VSplitContainer',
    inherits: 'SplitContainer',
    methods: [],
    properties: [],
    signals: []
  },
  TabContainer: {
    name: 'TabContainer',
    inherits: 'Container',
    methods: [
      { name: 'get_tab_count', returnType: 'int', arguments: [] },
      { name: 'set_tab_title', returnType: 'void', arguments: [{ name: 'tab_idx', type: 'int' }, { name: 'title', type: 'String' }] },
      { name: 'get_tab_title', returnType: 'String', arguments: [{ name: 'tab_idx', type: 'int' }] },
      { name: 'get_current_tab_control', returnType: 'Control', arguments: [] }
    ],
    properties: [
      { name: 'current_tab', type: 'int' },
      { name: 'tabs_position', type: 'int' },
      { name: 'clip_tabs', type: 'bool' }
    ],
    signals: [
      { name: 'tab_changed', arguments: [{ name: 'tab', type: 'int' }] },
      { name: 'tab_selected', arguments: [{ name: 'tab', type: 'int' }] },
      { name: 'tab_hovered', arguments: [{ name: 'tab', type: 'int' }] }
    ]
  },
  SubViewportContainer: {
    name: 'SubViewportContainer',
    inherits: 'Container',
    methods: [],
    properties: [
      { name: 'stretch', type: 'bool' },
      { name: 'stretch_shrink', type: 'int' }
    ],
    signals: []
  }
};
