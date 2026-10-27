/**
 * @file project-references-radar.ts
 * Scans and verifies TypeScript Project References across the Aegis monorepo.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PackageReferenceDetail {
  packageName: string;
  packageDir: string;
  composite: boolean;
  referencesCount: number;
  missingReferences: string[];
}

export interface ProjectReferencesReport {
  valid: boolean;
  totalPackages: number;
  syncedPackages: number;
  errors: string[];
  details: PackageReferenceDetail[];
}

interface PackageJsonData {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TsConfigData {
  extends?: string;
  compilerOptions?: {
    composite?: boolean;
  };
  references?: Array<{ path: string }>;
}

export class ProjectReferencesRadar {
  private readonly rootDir: string;

  public constructor(rootDir?: string) {
    this.rootDir = rootDir ? path.resolve(rootDir) : this.findMonorepoRoot(process.cwd());
  }

  private findMonorepoRoot(startDir: string): string {
    let current = path.resolve(startDir);
    while (current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(current, 'turbo.json'))) {
        return current;
      }
      current = path.dirname(current);
    }
    return path.resolve(startDir);
  }

  private readJson<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const clean = raw.replace(/^\uFEFF/, '');
      return JSON.parse(clean) as T;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Failed to parse ${filePath}: ${msg}\n`);
      return null;
    }
  }

  private discoverPackageDirs(packagesDir: string): string[] {
    if (!fs.existsSync(packagesDir)) {
      return [];
    }
    const results: string[] = [];
    const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(packagesDir, entry.name);
      const pkgJsonPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        results.push(fullPath);
      } else {
        const subDirs = this.discoverPackageDirs(fullPath);
        results.push(...subDirs);
      }
    }
    return results;
  }

  private extractDeps(pkgJson: PackageJsonData): string[] {
    const deps: string[] = [];
    if (pkgJson.dependencies) {
      deps.push(...Object.keys(pkgJson.dependencies));
    }
    if (pkgJson.devDependencies) {
      deps.push(...Object.keys(pkgJson.devDependencies));
    }
    return deps.filter((dep) => dep.startsWith('@aegis/'));
  }

  private resolveComposite(tsConfig: TsConfigData, pkgDir: string): boolean {
    if (tsConfig.compilerOptions?.composite !== undefined) {
      return Boolean(tsConfig.compilerOptions.composite);
    }
    if (tsConfig.extends) {
      const basePath = path.resolve(pkgDir, tsConfig.extends);
      const baseConfig = this.readJson<TsConfigData>(basePath);
      if (baseConfig) {
        return this.resolveComposite(baseConfig, path.dirname(basePath));
      }
    }
    return false;
  }

  private checkPackageReferences(
    pkgDir: string,
    pkgMap: Map<string, string>,
    errors: string[]
  ): PackageReferenceDetail {
    const pkgJson = this.readJson<PackageJsonData>(path.join(pkgDir, 'package.json')) ?? {};
    const tsConfig = this.readJson<TsConfigData>(path.join(pkgDir, 'tsconfig.json')) ?? {};
    const pkgName = pkgJson.name ?? path.basename(pkgDir);

    const composite = this.resolveComposite(tsConfig, pkgDir);
    if (!composite) {
      errors.push(`Package ${pkgName} missing compilerOptions.composite = true`);
    }

    const declaredRefs = new Set(
      (tsConfig.references ?? []).map((ref) => path.resolve(pkgDir, ref.path))
    );
    const internalDeps = this.extractDeps(pkgJson);
    const missing: string[] = [];

    for (const dep of internalDeps) {
      const targetDir = pkgMap.get(dep);
      if (targetDir && !declaredRefs.has(targetDir)) {
        missing.push(dep);
        errors.push(`Package ${pkgName} missing tsconfig reference to internal dependency ${dep}`);
      }
    }

    return {
      packageName: pkgName,
      packageDir: pkgDir,
      composite,
      referencesCount: tsConfig.references?.length ?? 0,
      missingReferences: missing
    };
  }

  public scan(): ProjectReferencesReport {
    const errors: string[] = [];
    const packagesDir = path.join(this.rootDir, 'packages');
    const packageDirs = this.discoverPackageDirs(packagesDir);

    const pkgMap = new Map<string, string>();
    for (const dir of packageDirs) {
      const pkgJson = this.readJson<PackageJsonData>(path.join(dir, 'package.json'));
      if (pkgJson?.name) {
        pkgMap.set(pkgJson.name, dir);
      }
    }

    const details: PackageReferenceDetail[] = [];
    for (const dir of packageDirs) {
      const detail = this.checkPackageReferences(dir, pkgMap, errors);
      details.push(detail);
    }

    const syncedCount = details.filter((d) => d.composite && d.missingReferences.length === 0).length;

    return {
      valid: errors.length === 0,
      totalPackages: details.length,
      syncedPackages: syncedCount,
      errors,
      details
    };
  }
}
