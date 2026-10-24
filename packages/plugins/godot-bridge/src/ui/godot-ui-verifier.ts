import type { GodotUiTreePayload, GodotUiNode } from '../rpc/rpc-types.js';

export interface UiOverlap {
  nodeA: string;
  nodeB: string;
  intersectionRect: { x: number; y: number; width: number; height: number };
}

export interface UiClipping {
  nodeId: string;
  reason: 'out_of_bounds_left' | 'out_of_bounds_right' | 'out_of_bounds_top' | 'out_of_bounds_bottom';
}

export interface AspectVerificationResult {
  aspectRatio: string;
  passed: boolean;
  overlaps: UiOverlap[];
  clippings: UiClipping[];
  scannedCount: number;
}

export class GodotUiVerifier {
  public static readonly REQUIRED_ASPECT_RATIOS = ['16:9', '21:9', '16:10', '9:16', '9:18', '9:20'];

  public static readonly ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '21:9': { width: 2560, height: 1080 },
    '16:10': { width: 1920, height: 1200 },
    '4:3': { width: 1440, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '9:18': { width: 1080, height: 2160 },
    '9:19.5': { width: 1080, height: 2340 },
    '9:20': { width: 1080, height: 2400 },
    '3:4': { width: 1080, height: 1440 }
  };

  public verifyPayload(payload: GodotUiTreePayload): AspectVerificationResult {
    const overlaps = this.findOverlaps(payload.nodes);
    const clippings = this.findClippings(payload.nodes, payload.viewport);

    return {
      aspectRatio: payload.viewport.aspectRatio,
      passed: overlaps.length === 0 && clippings.length === 0,
      overlaps,
      clippings,
      scannedCount: payload.nodes.length
    };
  }

  private findClippings(nodes: GodotUiNode[], viewport: { width: number; height: number }): UiClipping[] {
    const clippings: UiClipping[] = [];
    for (const node of nodes) {
      if (!node.visible) continue;
      const { x, y, width, height } = node.rect;
      if (x < 0) clippings.push({ nodeId: node.id, reason: 'out_of_bounds_left' });
      if (y < 0) clippings.push({ nodeId: node.id, reason: 'out_of_bounds_top' });
      if (x + width > viewport.width) clippings.push({ nodeId: node.id, reason: 'out_of_bounds_right' });
      if (y + height > viewport.height) clippings.push({ nodeId: node.id, reason: 'out_of_bounds_bottom' });
    }
    return clippings;
  }

  private isAncestorDescendant(idA: string, idB: string): boolean {
    return idA.startsWith(`${idB}/`) || idB.startsWith(`${idA}/`);
  }

  private isInteractive(node: GodotUiNode): boolean {
    const t = node.type.toLowerCase();
    return t.includes('button') || t.includes('slider') || t.includes('lineedit');
  }

  private findOverlaps(nodes: GodotUiNode[]): UiOverlap[] {
    const overlaps: UiOverlap[] = [];
    const interactive = nodes.filter(n => n.visible && this.isInteractive(n));

    for (let i = 0; i < interactive.length; i++) {
      for (let j = i + 1; j < interactive.length; j++) {
        const a = interactive[i];
        const b = interactive[j];
        if (this.isAncestorDescendant(a.id, b.id)) continue;

        const overlap = this.computeIntersection(a, b);
        if (overlap) {
          overlaps.push({
            nodeA: a.id,
            nodeB: b.id,
            intersectionRect: overlap
          });
        }
      }
    }
    return overlaps;
  }

  private computeIntersection(
    a: GodotUiNode,
    b: GodotUiNode
  ): { x: number; y: number; width: number; height: number } | null {
    const x1 = Math.max(a.rect.x, b.rect.x);
    const y1 = Math.max(a.rect.y, b.rect.y);
    const x2 = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width);
    const y2 = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height);

    if (x2 > x1 && y2 > y1) {
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
    return null;
  }
}
