export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface ViewportConfig {
  width: number;
  height: number;
  name: string;
}

export interface LayoutViolation {
  type: 'OVERLAP' | 'VIEWPORT_OVERFLOW';
  elementId: string;
  conflictingElementId?: string;
  message: string;
}

export interface InspectionResult {
  passed: boolean;
  violations: LayoutViolation[];
  elementsScanned: number;
  tokenCost: number; // Always 0 tokens compared to multi-thousand vision tokens
}

export class BoundingBoxInspector {
  public checkOverlap(boxA: BoundingBox, boxB: BoundingBox): boolean {
    // If z-indices differ, they are intentionally layered
    if (boxA.zIndex !== undefined && boxB.zIndex !== undefined && boxA.zIndex !== boxB.zIndex) {
      return false;
    }

    const noOverlap =
      boxA.x + boxA.width <= boxB.x ||
      boxB.x + boxB.width <= boxA.x ||
      boxA.y + boxA.height <= boxB.y ||
      boxB.y + boxB.height <= boxA.y;

    return !noOverlap;
  }

  public inspectLayout(boxes: BoundingBox[], viewport: ViewportConfig): InspectionResult {
    const violations: LayoutViolation[] = [];

    // 1. Viewport Overflow check
    for (const box of boxes) {
      if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) {
        violations.push({
          type: 'VIEWPORT_OVERFLOW',
          elementId: box.id,
          message: `Element "${box.id}" exceeds viewport boundary [${viewport.width}x${viewport.height} ${viewport.name}]. Coordinates: (${box.x}, ${box.y}, ${box.width}x${box.height})`
        });
      }
    }

    // 2. Pairwise Overlap check
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (this.checkOverlap(boxes[i], boxes[j])) {
          violations.push({
            type: 'OVERLAP',
            elementId: boxes[i].id,
            conflictingElementId: boxes[j].id,
            message: `Unintended overlap between "${boxes[i].id}" and "${boxes[j].id}".`
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      elementsScanned: boxes.length,
      tokenCost: 0
    };
  }
}
