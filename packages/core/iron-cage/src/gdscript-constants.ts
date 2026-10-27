/**
 * @file gdscript-constants.ts
 * Engine signals, ref-counted types, and block structures for GDScript static validation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface GDScriptFuncBlock {
  name: string;
  startLine: number;
  lines: string[];
}

export const GDSCRIPT_REF_COUNTED_TYPES = new Set([
  'RegEx', 'ConfigFile', 'InputEventKey', 'InputEventMouseButton',
  'InputEventScreenTouch', 'InputEventScreenDrag', 'InputEventAction',
  'RandomNumberGenerator', 'Image', 'Resource', 'AegisUiVerifier',
  'RefCounted', 'JSON', 'WordData', 'AegisCompatBridge', 'TCP_Server',
  'StreamPeerTCP', 'FileAccess', 'DirAccess', 'ImageTexture', 'AudioStream'
]);

export const GDSCRIPT_ENGINE_SIGNALS = new Set([
  'pressed', 'released', 'button_up', 'button_down', 'toggled', 'timeout',
  'ready', 'tree_entered', 'tree_exited', 'visibility_changed', 'draw',
  'resized', 'focus_entered', 'focus_exited', 'mouse_entered', 'mouse_exited',
  'item_selected', 'text_changed', 'text_submitted', 'request_completed', 'finished'
]);
