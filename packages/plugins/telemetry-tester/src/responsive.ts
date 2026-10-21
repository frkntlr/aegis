import { BoundingBoxInspector, type BoundingBox, type ViewportConfig, type InspectionResult } from './bounding-box.js';

export const STANDARD_VIEWPORTS: Record<string, ViewportConfig> = {
  desktop: { width: 1920, height: 1080, name: 'Desktop Full HD' },
  laptop: { width: 1366, height: 768, name: 'Laptop WXGA' },
  mobile: { width: 390, height: 844, name: 'Mobile iPhone standard' }
};

export interface MultiViewportReport {
  overallPassed: boolean;
  reports: Record<string, InspectionResult>;
}

export class ResponsiveLayoutTester {
  private inspector = new BoundingBoxInspector();

  public testAllViewports(layoutProvider: (viewport: ViewportConfig) => BoundingBox[]): MultiViewportReport {
    const reports: Record<string, InspectionResult> = {};
    let overallPassed = true;

    for (const [key, viewport] of Object.entries(STANDARD_VIEWPORTS)) {
      const boxes = layoutProvider(viewport);
      const res = this.inspector.inspectLayout(boxes, viewport);
      reports[key] = res;
      if (!res.passed) {
        overallPassed = false;
      }
    }

    return {
      overallPassed,
      reports
    };
  }
}
