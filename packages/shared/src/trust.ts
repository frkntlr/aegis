export interface TrustAuditReport {
  suspicious: boolean;
  tamperedTestFiles: string[];
  vacuousAssertionsFound: number;
  mutationScorePercent: number;
  verdict: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW_REQUIRED';
  details: string[];
  assertionDensity?: number;
  scopeViolations?: string[];
  fidelityIssues?: string[];
}
