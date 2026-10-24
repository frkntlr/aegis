import { test } from 'node:test';
import * as assert from 'node:assert';
import { GoSkeletonExtractor } from './go-extractor.js';
import { CppSkeletonExtractor } from './cpp-extractor.js';
import { RustSkeletonExtractor } from './rust-extractor.js';
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

test('GoSkeletonExtractor correctly handles braces in strings, raw strings, and comments', () => {
  const code = `
package main
import "fmt"
func First() {
    fmt.Println("{")
    // {
    /* {
       } */
    raw := \`{\`
    fmt.Println(raw)
}
func Second() int {
    return 42
}
`.trim();

  const extractor = new GoSkeletonExtractor();
  const res = extractor.extract('test.go', code);
  assert.ok(res.skeletonContent.includes('func First() { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('func Second() int { /* body omitted */ }'));
});

test('CppSkeletonExtractor correctly handles braces in strings and comments', () => {
  const code = `
#include <iostream>
void first() {
    std::cout << "{" << '{' << std::endl;
    // {
    /* {
    } */
}
int second() {
    return 100;
}
`.trim();

  const extractor = new CppSkeletonExtractor();
  const res = extractor.extract('test.cpp', code);
  assert.ok(res.skeletonContent.includes('void first() { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('int second() { /* body omitted */ }'));
});

test('RustSkeletonExtractor correctly handles braces in strings, chars, raw strings, and comments', () => {
  const code = `
use std::fmt;
pub fn first() {
    let s = "{";
    let c = '{';
    let raw = r#"{"#;
    // {
    /* {
    } */
}
pub fn second() -> i32 {
    42
}
`.trim();

  const extractor = new RustSkeletonExtractor();
  const res = extractor.extract('test.rs', code);
  assert.ok(res.skeletonContent.includes('pub fn first() { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('pub fn second() -> i32 { /* body omitted */ }'));
});

test('GoSkeletonExtractor preserves nested structs with correct closing brace depth', () => {
  const code = `
package main
type AppConfig struct {
    Database struct {
        Host string
        Port int
    }
    TimeoutSeconds int
}
func Run() {}
`.trim();

  const extractor = new GoSkeletonExtractor();
  const res = extractor.extract('config.go', code);
  assert.ok(res.skeletonContent.includes('type AppConfig struct {'));
  assert.ok(res.skeletonContent.includes('Database struct {'));
  assert.ok(res.skeletonContent.includes('TimeoutSeconds int'));
  assert.ok(res.skeletonContent.includes('func Run() { /* body omitted */ }'));
});

test('CppSkeletonExtractor omits function bodies on single-line template functions', () => {
  const code = `
template<typename T> void add(T a, T b) {
    int x = 1;
    return a + b;
}
template<typename T> class SafeContainer {
public:
    T val;
};
`.trim();

  const extractor = new CppSkeletonExtractor();
  const res = extractor.extract('math.hpp', code);
  assert.ok(res.skeletonContent.includes('template<typename T> void add(T a, T b) { /* body omitted */ }'));
  assert.ok(!res.skeletonContent.includes('int x = 1;'));
  assert.ok(res.skeletonContent.includes('template<typename T> class SafeContainer {'));
});

test('CppSkeletonExtractor correctly masks multi-line block comments containing braces', () => {
  const code = `
#include <iostream>
/*
 * Multi-line comment block
 * void fakeFunc() {
 *    int insideComment = 1;
 * }
 */
void realFunction(int a) {
    /* another block
       with { mismatched braces */
    int b = a + 1;
}
`.trim();

  const extractor = new CppSkeletonExtractor();
  const res = extractor.extract('sample.cpp', code);
  assert.ok(!res.skeletonContent.includes('fakeFunc'));
  assert.ok(res.skeletonContent.includes('void realFunction(int a) { /* body omitted */ }'));
});

test('GoSkeletonExtractor masks multi-line raw strings and block comments containing braces', () => {
  const code = `
package main
type User struct {
    Name string \`json:"name"\`
}
/*
func CommentedOut() {
    return
}
*/
func Execute() {
    rawSQL := \`
        SELECT * FROM table
        WHERE data = '{\`
    fmt.Println(rawSQL)
}
func Next() string {
    return "ok"
}
`.trim();

  const extractor = new GoSkeletonExtractor();
  const res = extractor.extract('main.go', code);
  assert.ok(res.skeletonContent.includes('Name string `json:"name"`'));
  assert.ok(!res.skeletonContent.includes('CommentedOut'));
  assert.ok(res.skeletonContent.includes('func Execute() { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('func Next() string { /* body omitted */ }'));
});
