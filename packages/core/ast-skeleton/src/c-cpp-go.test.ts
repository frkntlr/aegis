import { test } from 'node:test';
import * as assert from 'node:assert';
import { GoSkeletonExtractor } from './go-extractor.js';
import { CppSkeletonExtractor } from './cpp-extractor.js';
import { SkeletonGenerator } from './skeleton-generator.js';

const sampleGoCode = `
package main
import "fmt"
type ServerConfig struct { Port int }
type Service interface { Start() error }
func NewServer(cfg ServerConfig) *Server { return &Server{Port: cfg.Port} }
func (s *Server) Start() error { fmt.Println("OK"); return nil }
`.trim();

const sampleCppCode = `
#include <iostream>
namespace engine {
class GameEntity { public: int id; };
void GameEntity::update(float dt) { for (int i = 0; i < 10; i++) {} }
int calculateDamage(int base) { return base * 2; }
}
`.trim();

test('GoSkeletonExtractor extracts Go structs, interfaces, and functions', () => {
  const extractor = new GoSkeletonExtractor();
  const res = extractor.extract('main.go', sampleGoCode);
  assert.ok(res.skeletonContent.includes('package main'));
  assert.ok(res.skeletonContent.includes('type ServerConfig struct {'));
  assert.ok(res.skeletonContent.includes('type Service interface {'));
  assert.ok(res.skeletonContent.includes('func NewServer(cfg ServerConfig) *Server { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('func (s *Server) Start() error { /* body omitted */ }'));
  assert.ok(res.tokenSavingsPercent > 0);
});

test('CppSkeletonExtractor extracts C/C++ classes, headers, and function bodies', () => {
  const extractor = new CppSkeletonExtractor();
  const res = extractor.extract('entity.cpp', sampleCppCode);
  assert.ok(res.skeletonContent.includes('#include <iostream>'));
  assert.ok(res.skeletonContent.includes('namespace engine {'));
  assert.ok(res.skeletonContent.includes('class GameEntity {'));
  assert.ok(res.skeletonContent.includes('void GameEntity::update(float dt) { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('int calculateDamage(int base) { /* body omitted */ }'));
  assert.ok(res.tokenSavingsPercent > 0);
});

test('SkeletonGenerator correctly routes Go and C/C++ files', () => {
  const gen = new SkeletonGenerator();
  const reg = gen.getRegistry();

  assert.ok(reg.listLanguages().includes('go'));
  assert.ok(reg.listLanguages().includes('cpp'));

  const goExt = reg.getExtractor('service.go');
  assert.strictEqual(goExt?.languageId, 'go');

  const cppExt = reg.getExtractor('main.cpp');
  assert.strictEqual(cppExt?.languageId, 'cpp');

  const headerExt = reg.getExtractor('types.hpp');
  assert.strictEqual(headerExt?.languageId, 'cpp');
});
