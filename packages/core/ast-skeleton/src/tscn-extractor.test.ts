import { test } from 'node:test';
import * as assert from 'node:assert';
import { TscnSkeletonExtractor } from './tscn-extractor.js';
import { SkeletonGenerator } from './skeleton-generator.js';

const sampleTscn = `[gd_scene load_steps=3 format=3 uid="uid://test1234"]

[ext_resource type="Script" path="res://player.gd" id="1_abc"]
[ext_resource type="Texture2D" path="res://icon.svg" id="2_def"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_1"]
size = Vector2(32, 64)

[node name="Player" type="CharacterBody2D"]
position = Vector2(100, 200)
rotation = 1.5708
script = ExtResource("1_abc")

[node name="Sprite2D" type="Sprite2D" parent="."]
texture = ExtResource("2_def")
offset = Vector2(10, 20)

[connection signal="body_entered" from="." to="." method="_on_body_entered"]
`;

test('TscnSkeletonExtractor preserves nodes, scripts, resources and signals while skipping raw coordinates', () => {
  const extractor = new TscnSkeletonExtractor();
  const res = extractor.extract('scenes/player.tscn', sampleTscn);

  assert.strictEqual(extractor.languageId, 'tscn');
  assert.ok(extractor.supportedExtensions.includes('.tscn'));
  assert.ok(extractor.supportedExtensions.includes('.tres'));

  assert.ok(res.skeletonContent.includes('[gd_scene'));
  assert.ok(res.skeletonContent.includes('ext_resource'));
  assert.ok(res.skeletonContent.includes('[node name="Player" type="CharacterBody2D"]'));
  assert.ok(res.skeletonContent.includes('script = ExtResource("1_abc")'));
  assert.ok(res.skeletonContent.includes('[node name="Sprite2D" type="Sprite2D" parent="."]'));
  assert.ok(res.skeletonContent.includes('[connection signal="body_entered"'));

  // Should omit position and offset raw data
  assert.ok(!res.skeletonContent.includes('position = Vector2(100, 200)'));
  assert.ok(!res.skeletonContent.includes('offset = Vector2(10, 20)'));
  assert.ok(res.tokenSavingsPercent > 0);
});

test('SkeletonGenerator handles .tscn via registry automatically', () => {
  const gen = new SkeletonGenerator();
  const res = gen.extractFile('player.tscn', sampleTscn);
  assert.ok(res.skeletonContent.includes('[node name="Player"'));
});

test('TscnSkeletonExtractor preserves [resource] header in .tres and unique_name_in_owner properties', () => {
  const extractor = new TscnSkeletonExtractor();
  const tresContent = [
    '[gd_resource type="Theme" format=3 uid="uid://tres123"]',
    '',
    '[resource]',
    'default_font_size = 24'
  ].join('\n');

  const tresRes = extractor.extract('theme.tres', tresContent);
  assert.ok(tresRes.skeletonContent.includes('[gd_resource'));
  assert.ok(tresRes.skeletonContent.includes('[resource]'));

  const uiTscn = [
    '[gd_scene format=3]',
    '[node name="StartBtn" type="Button"]',
    'unique_name_in_owner = true',
    'text = "BAŞLA"',
    'offset_left = 100.0'
  ].join('\n');

  const uiRes = extractor.extract('ui.tscn', uiTscn);
  assert.ok(uiRes.skeletonContent.includes('unique_name_in_owner = true'));
  assert.ok(uiRes.skeletonContent.includes('text = "BAŞLA"'));
  assert.ok(!uiRes.skeletonContent.includes('offset_left = 100.0'));
});
