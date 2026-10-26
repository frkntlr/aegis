/**
 * @file nuget-metadata-extractor.ts
 * Native metadata extractor for .NET C# NuGet packages using project.assets.json and companion XML doc files.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context7DocEntry } from './context7-bridge.js';

export interface NuGetPackageRef {
  name: string;
  version: string;
  packagePath: string;
}

export class NuGetMetadataExtractor {
  public static resolveGlobalNuGetDir(): string {
    return process.env.NUGET_PACKAGES || path.join(os.homedir(), '.nuget', 'packages');
  }

  public static parseProjectAssets(assetsJsonPath: string, nugetRootDir?: string): NuGetPackageRef[] {
    if (!fs.existsSync(assetsJsonPath)) return [];
    const baseNuGet = nugetRootDir || NuGetMetadataExtractor.resolveGlobalNuGetDir();
    const refs: NuGetPackageRef[] = [];

    try {
      const data = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf8'));
      const libraries = data.libraries || {};

      for (const [key, val] of Object.entries(libraries)) {
        const libObj = val as { type?: string; path?: string };
        if (libObj.type === 'package') {
          const [name, version] = key.split('/');
          if (name && version) {
            const relPath = libObj.path || path.join(name.toLowerCase(), version);
            const fullPkgPath = path.resolve(baseNuGet, relPath);
            refs.push({ name, version, packagePath: fullPkgPath });
          }
        }
      }
    } catch { /* ignore non-fatal */ }

    return refs;
  }

  public static parseXmlCompanion(xmlContent: string, packageName: string, version: string): Context7DocEntry[] {
    const entries: Context7DocEntry[] = [];
    const memberMatches = xmlContent.matchAll(/<member\s+name="([MTFPE]):([^"]+)">([\s\S]*?)<\/member>/g);

    for (const match of memberMatches) {
      const kind = match[1];
      const memberId = match[2];
      const body = match[3];

      const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
      const summary = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : `C# contract for ${memberId}`;

      const returnsMatch = body.match(/<returns>([\s\S]*?)<\/returns>/);
      const returns = returnsMatch ? returnsMatch[1].replace(/\s+/g, ' ').trim() : '';

      const parenIdx = memberId.indexOf('(');
      const namePart = parenIdx !== -1 ? memberId.slice(0, parenIdx) : memberId;
      const lastDot = namePart.lastIndexOf('.');
      const methodName = lastDot !== -1 ? namePart.slice(lastDot + 1) : namePart;
      const topic = parenIdx !== -1 ? `${methodName}${memberId.slice(parenIdx)}` : methodName;
      const signature = kind === 'M' ? `${memberId} -> ${returns || 'void'}` : `${kind}: ${memberId}`;

      entries.push({
        library: packageName,
        topic,
        version,
        summary,
        signatures: [signature],
        codeExample: `// ${summary}\n${signature}`
      });
      if (entries.length >= 50) break;
    }

    return entries;
  }

  public static findCompanionXml(packageDir: string): string | null {
    if (!fs.existsSync(packageDir)) return null;
    const libDir = path.join(packageDir, 'lib');
    if (!fs.existsSync(libDir)) return null;

    try {
      const tfms = fs.readdirSync(libDir);
      for (const tfm of tfms) {
        const tfmDir = path.join(libDir, tfm);
        if (fs.statSync(tfmDir).isDirectory()) {
          const files = fs.readdirSync(tfmDir);
          const xml = files.find(f => f.endsWith('.xml'));
          if (xml) return path.join(tfmDir, xml);
        }
      }
    } catch { /* ignore */ }

    return null;
  }

  public static extractFromProject(projectRoot: string, nugetRootDir?: string): Context7DocEntry[] {
    const docs: Context7DocEntry[] = [];
    let assetsPath: string | null = null;

    const directAssets = path.join(projectRoot, 'obj', 'project.assets.json');
    if (fs.existsSync(directAssets)) {
      assetsPath = directAssets;
    } else {
      try {
        const entries = fs.readdirSync(projectRoot, { recursive: true });
        for (const e of entries) {
          if (String(e).endsWith('project.assets.json')) {
            assetsPath = path.join(projectRoot, String(e));
            break;
          }
        }
      } catch { /* ignore */ }
    }

    if (!assetsPath) return docs;
    const pkgRefs = NuGetMetadataExtractor.parseProjectAssets(assetsPath, nugetRootDir);

    for (const ref of pkgRefs) {
      const xmlPath = NuGetMetadataExtractor.findCompanionXml(ref.packagePath);
      if (xmlPath && fs.existsSync(xmlPath)) {
        try {
          const content = fs.readFileSync(xmlPath, 'utf8');
          const parsed = NuGetMetadataExtractor.parseXmlCompanion(content, ref.name, ref.version);
          docs.push(...parsed);
        } catch { /* ignore */ }
      }
    }

    return docs;
  }
}
