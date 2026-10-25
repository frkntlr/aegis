import * as fs from 'node:fs';

export interface SceneValidationResult {
  valid: boolean;
  danglingUids: string[];
  invalidNodePaths: string[];
  invalidAnimationTracks: string[];
}

export class GodotSceneValidator {
  public static parseSceneNodes(tscnContent: string): Set<string> {
    const nodeNames = new Set<string>();
    const lines = tscnContent.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\[node\s+name="([^"]+)"/);
      if (m) nodeNames.add(m[1]);
    }
    return nodeNames;
  }

  public static validateUids(content: string, knownUids: Set<string>): string[] {
    const dangling: string[] = [];
    const uidMatches = content.matchAll(/uid:\/\/[a-zA-Z0-9]+/g);
    for (const m of uidMatches) {
      const uid = m[0];
      if (knownUids.size > 0 && !knownUids.has(uid)) {
        dangling.push(uid);
      }
    }
    return dangling;
  }

  public static validateNodePathsInScript(gdScriptContent: string, sceneNodes: Set<string>): string[] {
    const invalid: string[] = [];
    const nodePathMatches = gdScriptContent.matchAll(/(?:\$|get_node\(\s*["'])([a-zA-Z0-9_/]+)(?:["']\s*\))?/g);
    for (const m of nodePathMatches) {
      const p = m[1];
      const rootNode = p.split('/')[0];
      if (rootNode && !['..', '.', '%'].includes(rootNode) && !sceneNodes.has(rootNode)) {
        invalid.push(p);
      }
    }
    return invalid;
  }

  public static validateAnimationTracks(tscnContent: string, sceneNodes: Set<string>): string[] {
    const invalid: string[] = [];
    const trackMatches = tscnContent.matchAll(/tracks\/\d+\/path\s*=\s*NodePath\(["']([^"']+)["']\)/g);
    for (const m of trackMatches) {
      const trackPath = m[1];
      const targetNode = trackPath.split(':')[0].replace(/^\.\//, '');
      if (targetNode && !['.', '..'].includes(targetNode) && !sceneNodes.has(targetNode)) {
        invalid.push(trackPath);
      }
    }
    return invalid;
  }

  public static validateSceneFile(
    tscnPath: string,
    gdScriptPath?: string,
    knownUids: Set<string> = new Set()
  ): SceneValidationResult {
    if (!fs.existsSync(tscnPath)) {
      return { valid: false, danglingUids: [], invalidNodePaths: [], invalidAnimationTracks: [] };
    }
    const tscnContent = fs.readFileSync(tscnPath, 'utf8');
    const nodes = this.parseSceneNodes(tscnContent);
    const danglingUids = this.validateUids(tscnContent, knownUids);
    const invalidAnimationTracks = this.validateAnimationTracks(tscnContent, nodes);

    let invalidNodePaths: string[] = [];
    if (gdScriptPath && fs.existsSync(gdScriptPath)) {
      const gdContent = fs.readFileSync(gdScriptPath, 'utf8');
      invalidNodePaths = this.validateNodePathsInScript(gdContent, nodes);
    }

    const valid = danglingUids.length === 0 && invalidNodePaths.length === 0 && invalidAnimationTracks.length === 0;
    return { valid, danglingUids, invalidNodePaths, invalidAnimationTracks };
  }
}
