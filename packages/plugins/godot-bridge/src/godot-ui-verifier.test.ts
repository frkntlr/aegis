import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotUiVerifier } from './ui/godot-ui-verifier.js';
import type { GodotUiTreePayload } from './rpc/rpc-types.js';

test('GodotUiVerifier detects overlapping buttons and boundary clipping', () => {
  const verifier = new GodotUiVerifier();

  const payload: GodotUiTreePayload = {
    viewport: { width: 1920, height: 1080, aspectRatio: '16:9' },
    nodes: [
      {
        id: 'btn1',
        name: 'PlayButton',
        type: 'Button',
        visible: true,
        rect: { x: 100, y: 100, width: 200, height: 60 }
      },
      {
        id: 'btn2',
        name: 'SettingsButton',
        type: 'Button',
        visible: true,
        rect: { x: 150, y: 120, width: 200, height: 60 } // Overlaps with btn1!
      },
      {
        id: 'btn3',
        name: 'OutOfBoundsBtn',
        type: 'Button',
        visible: true,
        rect: { x: 1900, y: 500, width: 100, height: 50 } // Clips outside 1920 viewport!
      }
    ]
  };

  const res = verifier.verifyPayload(payload);
  assert.strictEqual(res.passed, false);
  assert.strictEqual(res.overlaps.length, 1);
  assert.strictEqual(res.overlaps[0].nodeA, 'btn1');
  assert.strictEqual(res.overlaps[0].nodeB, 'btn2');
  assert.strictEqual(res.clippings.length, 1);
  assert.strictEqual(res.clippings[0].nodeId, 'btn3');
  assert.strictEqual(res.clippings[0].reason, 'out_of_bounds_right');
});

test('GodotUiVerifier passes cleanly formatted layout across required aspect ratios', () => {
  const verifier = new GodotUiVerifier();

  for (const aspect of GodotUiVerifier.REQUIRED_ASPECT_RATIOS) {
    const dims = GodotUiVerifier.ASPECT_DIMENSIONS[aspect] ?? { width: 1920, height: 1080 };
    const payload: GodotUiTreePayload = {
      viewport: { width: dims.width, height: dims.height, aspectRatio: aspect },
      nodes: [
        {
          id: 'top_nav',
          name: 'TopNav',
          type: 'Panel',
          visible: true,
          rect: { x: 0, y: 0, width: dims.width, height: 80 }
        },
        {
          id: 'btn_ok',
          name: 'OkButton',
          type: 'Button',
          visible: true,
          rect: { x: 100, y: 150, width: 120, height: 40 }
        }
      ]
    };

    const res = verifier.verifyPayload(payload);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.overlaps.length, 0);
    assert.strictEqual(res.clippings.length, 0);
  }
});

test('GodotUiVerifier does not report overlap for parent-child hierarchies', () => {
  const verifier = new GodotUiVerifier();
  const payload: GodotUiTreePayload = {
    viewport: { width: 1920, height: 1080, aspectRatio: '16:9' },
    nodes: [
      {
        id: 'main_menu/play_btn',
        name: 'PlayButton',
        type: 'Button',
        visible: true,
        rect: { x: 100, y: 100, width: 200, height: 60 }
      },
      {
        id: 'main_menu/play_btn/sub_icon_btn',
        name: 'SubIconBtn',
        type: 'Button',
        visible: true,
        rect: { x: 110, y: 110, width: 40, height: 40 }
      }
    ]
  };
  const res = verifier.verifyPayload(payload);
  assert.strictEqual(res.overlaps.length, 0);
});
