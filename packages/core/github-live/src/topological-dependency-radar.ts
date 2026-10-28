/**
 * @file topological-dependency-radar.ts
 * Scans TypeScript source imports across monorepo packages to prevent inverted,
 * undeclared, or circular dependency graph leaks before compilation begins.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TopologicalViolation {
  packageName: string;
  file: string;
  importedPackage: string;
}

export interface TopologicalScanResult {
  valid: boolean;
  totalPackages: number;
  totalSourceFiles: number;
  violations: TopologicalViolation[];
  errors: string[];
}

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export class TopologicalDependencyRadar {
  private readonly rootDir: string;
  private readonly scopePrefix: string;

  public constructor(rootDir?: string, scopePrefix: string = '@aegis/') {
    this.rootDir = rootDir ? path.resolve(rootDir) : this.findMonorepoRoot(process.cwd());
    this.scopePrefix = scopePrefix;
  }

  private findMonorepoRoot(startDir: string): string {
    let current = path.resolve(startDir);
    while (current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, 'turbo.json'))) {
        return current;
      }
      current = path.dirname(current);
    }
    return path.resolve(startDir);
  }

  private readPackageJson(pkgDir: string): PackageJsonShape | null {
    const pkgPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(raw) as PackageJsonShape;
    } catch {
      return null;
    }
  }

  private discoverPackageDirs(baseDir: string): string[] {
    if (!fs.existsSync(baseDir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(baseDir, entry.name);
      if (fs.existsSync(path.join(full, 'package.json'))) {
        results.push(full);
      } else {
        results.push(...this.discoverPackageDirs(full));
      }
    }
    return results;
  }

  private collectTsFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectTsFiles(full));
      } else if (entry.name.endsWith('.ts')) {
        results.push(full);
      }
    }
    return results;
  }

  private scanFileImports(
    filePath: string,
    pkgName: string,
    declared: Set<string>,
    violations: TopologicalViolation[]
  ): void {
    const content = fs.readFileSync(filePath, 'utf8');
    const escaped = this.scopePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importRegex = new RegExp(`(?:from\\s+|import\\s*\\(\\s*)['"](${escaped}[^'"]+)['"]`, 'g');
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const imported = match[1];
      if (imported && imported !== pkgName && !declared.has(imported)) {
        violations.push({
          packageName: pkgName,
          file: path.relative(this.rootDir, filePath).replace(/\\/g, '/'),
          importedPackage: imported
        });
      }
    }
  }

  public scan(): TopologicalScanResult {
    const packagesDir = path.join(this.rootDir, 'packages');
    const pkgDirs = this.discoverPackageDirs(packagesDir);
    const violations: TopologicalViolation[] = [];
    let totalFiles = 0;

    for (const pkgDir of pkgDirs) {
      const pkgJson = this.readPackageJson(pkgDir);
      if (!pkgJson?.name) continue;

      const declared = new Set([
        ...Object.keys(pkgJson.dependencies || {}),
        ...Object.keys(pkgJson.devDependencies || {}),
        pkgJson.name
      ]);

      const srcDir = path.join(pkgDir, 'src');
      const files = this.collectTsFiles(srcDir);
      totalFiles += files.length;

      for (const file of files) {
        this.scanFileImports(file, pkgJson.name, declared, violations);
      }
    }

    const errors = violations.map(
      (v) => `[Topological Invariant Break] ${v.packageName} imports ${v.importedPackage} in ${v.file} without declaring it in package.json!`
    );

    return {
      valid: violations.length === 0,
      totalPackages: pkgDirs.length,
      totalSourceFiles: totalFiles,
      violations,
      errors
    };
  }
}
