/**
 * @file godot-ui-templates.ts
 * Production-ready Godot 4 UI templates for scenes, scripts, and themes.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

const MENU_HEADER = (name: string, script: string) => [
  '[gd_scene load_steps=2 format=3]',
  `[ext_resource type="Script" path="${script}" id="1_script"]`,
  `[node name="${name}" type="Control"]`,
  'layout_mode = 3',
  'anchors_preset = 15',
  'anchor_right = 1.0',
  'anchor_bottom = 1.0',
  'grow_horizontal = 2',
  'grow_vertical = 2',
  'script = ExtResource("1_script")'
].join('\n');

const MENU_BODY = (title: string) => [
  '[node name="Background" type="ColorRect" parent="."]',
  'layout_mode = 1\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'color = Color(0.08, 0.09, 0.12, 0.95)\n',
  '[node name="Margin" type="MarginContainer" parent="."]',
  'layout_mode = 1\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\ngrow_horizontal = 2\ngrow_vertical = 2',
  'theme_override_constants/margin_left = 40\ntheme_override_constants/margin_top = 40',
  'theme_override_constants/margin_right = 40\ntheme_override_constants/margin_bottom = 40\n',
  '[node name="MenuBox" type="VBoxContainer" parent="Margin"]',
  'layout_mode = 2\nsize_flags_horizontal = 4\nsize_flags_vertical = 4\ntheme_override_constants/separation = 16\nalignment = 1\n',
  '[node name="TitleLabel" type="Label" parent="Margin/MenuBox"]',
  'unique_name_in_owner = true\nlayout_mode = 2\ntheme_override_font_sizes/font_size = 36',
  `text = "${title}"\nhorizontal_alignment = 1\n`,
  '[node name="StartButton" type="Button" parent="Margin/MenuBox"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(240, 50)\nlayout_mode = 2\ntext = "Start Game"\n',
  '[node name="OptionsButton" type="Button" parent="Margin/MenuBox"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(240, 50)\nlayout_mode = 2\ntext = "Options"\n',
  '[node name="ExitButton" type="Button" parent="Margin/MenuBox"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(240, 50)\nlayout_mode = 2\ntext = "Exit"'
].join('\n');

export function buildMenuScene(name: string, scriptPath: string, title: string): string {
  return `${MENU_HEADER(name, scriptPath)}\n\n${MENU_BODY(title)}\n`;
}

export function buildMenuScript(pascal: string): string {
  return [
    'extends Control',
    `class_name ${pascal}\n`,
    'signal start_pressed',
    'signal options_pressed',
    'signal exit_pressed\n',
    '@onready var start_button: Button = %StartButton',
    '@onready var options_button: Button = %OptionsButton',
    '@onready var exit_button: Button = %ExitButton\n',
    'func _ready() -> void:',
    '\tif start_button: start_button.pressed.connect(func(): start_pressed.emit())',
    '\tif options_button: options_button.pressed.connect(func(): options_pressed.emit())',
    '\tif exit_button: exit_button.pressed.connect(func(): exit_pressed.emit())'
  ].join('\n') + '\n';
}

const HUD_SCENE_TEXT = (name: string, script: string) => [
  '[gd_scene load_steps=2 format=3]',
  `[ext_resource type="Script" path="${script}" id="1_script"]\n`,
  `[node name="${name}" type="CanvasLayer"]`,
  'script = ExtResource("1_script")\n',
  '[node name="TopLeftMargin" type="MarginContainer" parent="."]',
  'anchors_preset = 0\noffset_right = 260.0\noffset_bottom = 70.0\ntheme_override_constants/margin_left = 20\ntheme_override_constants/margin_top = 20\n',
  '[node name="HealthBox" type="VBoxContainer" parent="TopLeftMargin"]\nlayout_mode = 2\n',
  '[node name="HealthLabel" type="Label" parent="TopLeftMargin/HealthBox"]\nlayout_mode = 2\ntext = "Health"\n',
  '[node name="HealthBar" type="ProgressBar" parent="TopLeftMargin/HealthBox"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(200, 24)\nlayout_mode = 2\nvalue = 100.0\n',
  '[node name="TopRightMargin" type="MarginContainer" parent="."]',
  'anchors_preset = 1\nanchor_left = 1.0\nanchor_right = 1.0\noffset_left = -220.0\noffset_bottom = 70.0\ngrow_horizontal = 0\ntheme_override_constants/margin_top = 20\ntheme_override_constants/margin_right = 20\n',
  '[node name="ScoreLabel" type="Label" parent="TopRightMargin"]',
  'unique_name_in_owner = true\nlayout_mode = 2\ntheme_override_font_sizes/font_size = 24\ntext = "Score: 0"\nhorizontal_alignment = 2'
].join('\n');

export function buildHudScene(name: string, scriptPath: string): string {
  return `${HUD_SCENE_TEXT(name, scriptPath)}\n`;
}

export function buildHudScript(pascal: string): string {
  return [
    'extends CanvasLayer',
    `class_name ${pascal}\n`,
    '@onready var health_bar: ProgressBar = %HealthBar',
    '@onready var score_label: Label = %ScoreLabel\n',
    'func set_health(current: float, max_val: float = 100.0) -> void:',
    '\tif health_bar:',
    '\t\thealth_bar.max_value = max_val',
    '\t\thealth_bar.value = current\n',
    'func set_score(points: int) -> void:',
    '\tif score_label:',
    '\t\tscore_label.text = "Score: %d" % points'
  ].join('\n') + '\n';
}

const DIALOG_SCENE_TEXT = (name: string, script: string, title: string) => [
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
  'offset_left = -160.0\noffset_top = -90.0\noffset_right = 160.0\noffset_bottom = 90.0\ngrow_horizontal = 2\ngrow_vertical = 2\n',
  '[node name="VBox" type="VBoxContainer" parent="Panel"]\nlayout_mode = 2\ntheme_override_constants/separation = 12\n',
  '[node name="DialogTitle" type="Label" parent="Panel/VBox"]',
  `layout_mode = 2\ntheme_override_font_sizes/font_size = 20\ntext = "${title}"\nhorizontal_alignment = 1\n`,
  '[node name="DialogMessage" type="Label" parent="Panel/VBox"]',
  'unique_name_in_owner = true\nlayout_mode = 2\ntext = "Are you sure you want to proceed?"\nhorizontal_alignment = 1\n',
  '[node name="Actions" type="HBoxContainer" parent="Panel/VBox"]\nlayout_mode = 2\ntheme_override_constants/separation = 16\nalignment = 1\n',
  '[node name="CancelButton" type="Button" parent="Panel/VBox/Actions"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(100, 44)\nlayout_mode = 2\ntext = "Cancel"\n',
  '[node name="ConfirmButton" type="Button" parent="Panel/VBox/Actions"]',
  'unique_name_in_owner = true\ncustom_minimum_size = Vector2(100, 44)\nlayout_mode = 2\ntext = "Confirm"'
].join('\n');

export function buildDialogScene(name: string, scriptPath: string, title: string): string {
  return `${DIALOG_SCENE_TEXT(name, scriptPath, title)}\n`;
}

export function buildDialogScript(pascal: string): string {
  return [
    'extends Control',
    `class_name ${pascal}\n`,
    'signal confirmed',
    'signal cancelled\n',
    '@onready var confirm_button: Button = %ConfirmButton',
    '@onready var cancel_button: Button = %CancelButton',
    '@onready var message_label: Label = %DialogMessage\n',
    'func _ready() -> void:',
    '\tif confirm_button: confirm_button.pressed.connect(func(): confirmed.emit())',
    '\tif cancel_button: cancel_button.pressed.connect(func(): cancelled.emit())\n',
    'func set_message(text: String) -> void:',
    '\tif message_label: message_label.text = text'
  ].join('\n') + '\n';
}

export function buildThemeContent(): string {
  return [
    '[gd_resource type="Theme" load_steps=3 format=3]\n',
    '[sub_resource type="StyleBoxFlat" id="StyleBoxFlat_normal"]',
    'bg_color = Color(0.16, 0.18, 0.22, 1)',
    'corner_radius_top_left = 6\ncorner_radius_top_right = 6',
    'corner_radius_bottom_right = 6\ncorner_radius_bottom_left = 6',
    'content_margin_left = 12.0\ncontent_margin_top = 8.0',
    'content_margin_right = 12.0\ncontent_margin_bottom = 8.0\n',
    '[sub_resource type="StyleBoxFlat" id="StyleBoxFlat_hover"]',
    'bg_color = Color(0.24, 0.28, 0.35, 1)',
    'border_width_left = 1\nborder_width_top = 1\nborder_width_right = 1\nborder_width_bottom = 1',
    'border_color = Color(0.38, 0.65, 0.98, 1)',
    'corner_radius_top_left = 6\ncorner_radius_top_right = 6',
    'corner_radius_bottom_right = 6\ncorner_radius_bottom_left = 6',
    'content_margin_left = 12.0\ncontent_margin_top = 8.0',
    'content_margin_right = 12.0\ncontent_margin_bottom = 8.0\n',
    '[resource]',
    'default_font_size = 16',
    'Button/styles/normal = SubResource("StyleBoxFlat_normal")',
    'Button/styles/hover = SubResource("StyleBoxFlat_hover")',
    'Button/styles/pressed = SubResource("StyleBoxFlat_hover")'
  ].join('\n') + '\n';
}
