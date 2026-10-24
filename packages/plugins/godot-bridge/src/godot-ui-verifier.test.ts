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
    const payload: GodotUiTreePayload = {
      viewport: { width: 1920, height: 1080, aspectRatio: aspect },
      nodes: [
        {
          id: 'top_nav',
          name: 'TopNav',
          type: 'Panel',
          visible: true,
          rect: { x: 0, y: 0, width: 1920, height: 80 }
        },
        {
          id: 'btn_ok',
          name: 'OkButton',
          type: 'Button',
          visible: true,
          rect: { x: 500, y: 300, width: 120, height: 40 }
        }
      ]
    };

    const res = verifier.verifyPayload(payload);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.overlaps.length, 0);
    assert.strictEqual(res.clippings.length, 0);
  }
});
