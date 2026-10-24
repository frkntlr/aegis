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
  public static readonly REQUIRED_ASPECT_RATIOS = ['16:9', '21:9', '16:10', '9:16'];

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

  private findOverlaps(nodes: GodotUiNode[]): UiOverlap[] {
    const overlaps: UiOverlap[] = [];
    const interactive = nodes.filter(n => n.visible && n.type.toLowerCase().includes('button'));

    for (let i = 0; i < interactive.length; i++) {
      for (let j = i + 1; j < interactive.length; j++) {
        const overlap = this.computeIntersection(interactive[i], interactive[j]);
        if (overlap) {
          overlaps.push({
            nodeA: interactive[i].id,
            nodeB: interactive[j].id,
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
