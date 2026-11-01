/**
 * @file godot-ui-templates-ext.ts
 * Extended Godot 4 UI templates for settings, options, and inventory grids.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

const SETTINGS_SCENE_TEXT = (name: string, script: string, title: string) => [
  '[gd_scene load_steps=2 format=3]',
  `[ext_resource type="Script" path="${script}" id="1_script"]\n`,
  `[node name="${name}" type="Control"]`,
  'layout_mode = 3\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'script = ExtResource("1_script")\n',
  '[node name="Background" type="ColorRect" parent="."]',
  'layout_mode = 1\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'color = Color(0.08, 0.09, 0.12, 0.95)\n',
  '[node name="Margin" type="MarginContainer" parent="."]',
  'layout_mode = 1\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'theme_override_constants/margin_left = 60\ntheme_override_constants/margin_top = 40',
  'theme_override_constants/margin_right = 60\ntheme_override_constants/margin_bottom = 40\n',
  '[node name="MainVBox" type="VBoxContainer" parent="Margin"]',
  'layout_mode = 2\ntheme_override_constants/separation = 20\n',
  '[node name="TitleLabel" type="Label" parent="Margin/MainVBox"]',
  'unique_name_in_owner = true\nlayout_mode = 2\ntheme_override_font_sizes/font_size = 32',
  `text = "${title}"\nhorizontal_alignment = 1\n`,
  '[node name="Tabs" type="TabContainer" parent="Margin/MainVBox"]',
  'unique_name_in_owner = true\nlayout_mode = 2\nsize_flags_vertical = 3\ncurrent_tab = 0\n',
  '[node name="Audio" type="VBoxContainer" parent="Margin/MainVBox/Tabs"]',
  'layout_mode = 2\ntheme_override_constants/separation = 12\n',
  '[node name="MasterVolLabel" type="Label" parent="Margin/MainVBox/Tabs/Audio"]\nlayout_mode = 2\ntext = "Master Volume"\n',
  '[node name="MasterSlider" type="HSlider" parent="Margin/MainVBox/Tabs/Audio"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(200, 32)\nlayout_mode = 2\nvalue = 80.0\n',
  '[node name="Video" type="VBoxContainer" parent="Margin/MainVBox/Tabs"]',
  'visible = false\nlayout_mode = 2\ntheme_override_constants/separation = 12\n',
  '[node name="FullscreenCheck" type="CheckBox" parent="Margin/MainVBox/Tabs/Video"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(160, 44)\nlayout_mode = 2\ntext = "Fullscreen Mode"\n',
  '[node name="Accessibility" type="VBoxContainer" parent="Margin/MainVBox/Tabs"]',
  'visible = false\nlayout_mode = 2\ntheme_override_constants/separation = 12\n',
  '[node name="ScreenReaderCheck" type="CheckBox" parent="Margin/MainVBox/Tabs/Accessibility"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(200, 44)\nlayout_mode = 2\ntext = "Enable Screen Reader (AccessKit)"\n',
  '[node name="Actions" type="HBoxContainer" parent="Margin/MainVBox"]',
  'layout_mode = 2\ntheme_override_constants/separation = 20\nalignment = 1\n',
  '[node name="BackButton" type="Button" parent="Margin/MainVBox/Actions"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(140, 44)\nlayout_mode = 2\ntext = "Back"'
].join('\n');

export function buildSettingsScene(name: string, scriptPath: string, title = 'Settings'): string {
  return `${SETTINGS_SCENE_TEXT(name, scriptPath, title)}\n`;
}

export function buildSettingsScript(pascal: string): string {
  return [
    'extends Control',
    `class_name ${pascal}\n`,
    'signal setting_changed(section: StringName, key: StringName, value: Variant)',
    'signal back_pressed\n',
    '@onready var master_slider: HSlider = %MasterSlider',
    '@onready var fullscreen_check: CheckBox = %FullscreenCheck',
    '@onready var screen_reader_check: CheckBox = %ScreenReaderCheck',
    '@onready var back_button: Button = %BackButton\n',
    'func _ready() -> void:',
    '\tif master_slider: master_slider.value_changed.connect(func(v: float): setting_changed.emit(&"audio", &"master", v))',
    '\tif fullscreen_check: fullscreen_check.toggled.connect(func(v: bool): setting_changed.emit(&"video", &"fullscreen", v))',
    '\tif screen_reader_check: screen_reader_check.toggled.connect(func(v: bool): setting_changed.emit(&"a11y", &"screen_reader", v))',
    '\tif back_button: back_button.pressed.connect(func(): back_pressed.emit())'
  ].join('\n') + '\n';
}

const INVENTORY_SCENE_TEXT = (name: string, script: string, title: string) => [
  '[gd_scene load_steps=2 format=3]',
  `[ext_resource type="Script" path="${script}" id="1_script"]\n`,
  `[node name="${name}" type="Control"]`,
  'layout_mode = 3\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'script = ExtResource("1_script")\n',
  '[node name="Dimmer" type="ColorRect" parent="."]',
  'layout_mode = 1\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'color = Color(0, 0, 0, 0.6)\n',
  '[node name="Panel" type="PanelContainer" parent="."]',
  'layout_mode = 1\nanchors_preset = 8\nanchor_left = 0.5\nanchor_top = 0.5\nanchor_right = 0.5\nanchor_bottom = 0.5',
  'offset_left = -260.0\noffset_top = -180.0\noffset_right = 260.0\noffset_bottom = 180.0\ngrow_horizontal = 2\ngrow_vertical = 2\n',
  '[node name="VBox" type="VBoxContainer" parent="Panel"]\nlayout_mode = 2\ntheme_override_constants/separation = 16\n',
  '[node name="TitleLabel" type="Label" parent="Panel/VBox"]',
  `layout_mode = 2\ntheme_override_font_sizes/font_size = 22\ntext = "${title}"\nhorizontal_alignment = 1\n`,
  '[node name="Grid" type="GridContainer" parent="Panel/VBox"]',
  'unique_name_in_owner = true\nlayout_mode = 2\ncolumns = 4\ntheme_override_constants/h_separation = 8\ntheme_override_constants/v_separation = 8\n',
  '[node name="CloseButton" type="Button" parent="Panel/VBox"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(120, 44)\nlayout_mode = 2\nsize_flags_horizontal = 4\ntext = "Close"'
].join('\n');

export function buildInventoryScene(name: string, scriptPath: string, title = 'Inventory'): string {
  return `${INVENTORY_SCENE_TEXT(name, scriptPath, title)}\n`;
}

export function buildInventoryScript(pascal: string): string {
  return [
    'extends Control',
    `class_name ${pascal}\n`,
    'signal item_selected(slot_index: int)',
    'signal closed\n',
    '@onready var grid: GridContainer = %Grid',
    '@onready var close_button: Button = %CloseButton\n',
    'func _ready() -> void:',
    '\tif close_button: close_button.pressed.connect(func(): closed.emit())',
    '\t_populate_slots(16)\n',
    'func _populate_slots(count: int) -> void:',
    '\tif not grid: return',
    '\tfor i in range(count):',
    '\t\tvar btn := Button.new()',
    '\t\tbtn.custom_minimum_size = Vector2(48, 48)',
    '\t\tbtn.text = "%d" % (i + 1)',
    '\t\tbtn.pressed.connect(func(): item_selected.emit(i))',
    '\t\tgrid.add_child(btn)'
  ].join('\n') + '\n';
}
