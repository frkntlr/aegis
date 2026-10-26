/**
 * @file symbiotic-diagnostic-triangulator.ts
 * Cross-references local call-site AST slices against Context7 ground-truth library contracts
 * to diagnose boundary exceptions with 100% falsifiable hypotheses.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { ClarificationOption } from './types.js';

export type BoundaryDiscrepancyType =
  | 'ARITY_MISMATCH'
  | 'TYPE_MISMATCH'
  | 'DEPRECATED_API'
  | 'SIGNATURE_MISMATCH'
  | 'NONE';

export interface BoundaryContractContext {
  library: string;
  symbol: string;
  expectedSignature?: string;
  isDeprecated?: boolean;
  deprecationNotice?: string;
  docs?: string[];
}

export interface BoundaryTriangulationInput {
  callSiteCode: string;
  contract: BoundaryContractContext;
  runtimeError?: string;
}

export interface BoundaryTriangulationResult {
  isBoundaryDefect: boolean;
  discrepancyType: BoundaryDiscrepancyType;
  explanation: string;
  falsifiableHypothesis: string;
  suggestedAction: string;
  actualArgCount?: number;
  expectedMinArgs?: number;
  expectedMaxArgs?: number;
}

export class SymbioticDiagnosticTriangulator {
  public static parseSignature(sig: string): { minArgs: number; maxArgs: number; paramNames: string[] } {
    const openParen = sig.indexOf('(');
    const closeParen = sig.lastIndexOf(')');
    if (openParen === -1 || closeParen <= openParen) {
      return { minArgs: 0, maxArgs: 0, paramNames: [] };
    }
    const inner = sig.slice(openParen + 1, closeParen).trim();
    if (!inner) return { minArgs: 0, maxArgs: 0, paramNames: [] };

    const rawParams = SymbioticDiagnosticTriangulator.splitTokens(inner, ',');
    let minArgs = 0;
    let maxArgs = 0;
    const paramNames: string[] = [];

    for (const p of rawParams) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      paramNames.push(trimmed);
      if (trimmed.startsWith('...')) {
        maxArgs = Number.POSITIVE_INFINITY;
      } else {
        if (!trimmed.includes('?') && !trimmed.includes('=')) minArgs++;
        if (maxArgs !== Number.POSITIVE_INFINITY) maxArgs++;
      }
    }
    return { minArgs, maxArgs, paramNames };
  }

  public static countCallArguments(callSite: string, targetSymbol?: string): number {
    let searchStart = 0;
    if (targetSymbol) {
      const idx = callSite.indexOf(targetSymbol);
      if (idx !== -1) searchStart = idx + targetSymbol.length;
    }
    const openParen = callSite.indexOf('(', searchStart);
    if (openParen === -1) return 0;
    const closeParen = SymbioticDiagnosticTriangulator.findMatchingParen(callSite, openParen);
    if (closeParen <= openParen) return 0;
    const inner = callSite.slice(openParen + 1, closeParen).trim();
    if (!inner) return 0;
    return SymbioticDiagnosticTriangulator.splitTokens(inner, ',').length;
  }

  public static triangulate(input: BoundaryTriangulationInput): BoundaryTriangulationResult {
    const { contract, callSiteCode, runtimeError } = input;

    if (contract.isDeprecated || contract.deprecationNotice) {
      return SymbioticDiagnosticTriangulator.buildDeprecationResult(contract);
    }

    if (contract.expectedSignature) {
      const parsedSig = SymbioticDiagnosticTriangulator.parseSignature(contract.expectedSignature);
      const actualArgs = SymbioticDiagnosticTriangulator.countCallArguments(callSiteCode, contract.symbol);
      if (actualArgs < parsedSig.minArgs || actualArgs > parsedSig.maxArgs) {
        return SymbioticDiagnosticTriangulator.buildArityResult(contract, actualArgs, parsedSig);
      }
    }

    if (runtimeError) {
      const errorResult = SymbioticDiagnosticTriangulator.evaluateRuntimeError(contract, runtimeError);
      if (errorResult.isBoundaryDefect) return errorResult;
    }

    return {
      isBoundaryDefect: false,
      discrepancyType: 'NONE',
      explanation: `Invocation matches upstream ground-truth contract for '${contract.symbol}'.`,
      falsifiableHypothesis: 'No library boundary contract violation identified.',
      suggestedAction: 'Inspect internal function logic instead of external library boundary.'
    };
  }

  public static toClarificationOption(result: BoundaryTriangulationResult): ClarificationOption | undefined {
    if (!result.isBoundaryDefect) return undefined;
    return {
      id: `hyp-boundary-${result.discrepancyType.toLowerCase()}`,
      label: result.explanation,
      hypothesisKey: `BOUNDARY_${result.discrepancyType}`,
      microProbeCommand: 'node packages/cli/dist/bin/aegis.js cage:check',
      confidenceScore: 0.95
    };
  }

  private static buildDeprecationResult(c: BoundaryContractContext): BoundaryTriangulationResult {
    const notice = c.deprecationNotice || 'Symbol marked as deprecated in upstream contract.';
    return {
      isBoundaryDefect: true,
      discrepancyType: 'DEPRECATED_API',
      explanation: `[${c.library}] '${c.symbol}' is deprecated: ${notice}`,
      falsifiableHypothesis: `Hypothesis [DEPRECATED_API]: Upstream API '${c.symbol}' is deprecated. Replacing it with modern contract will eliminate runtime fault.`,
      suggestedAction: `Refactor invocation to use non-deprecated API from '${c.library}'.`
    };
  }

  private static buildArityResult(
    c: BoundaryContractContext,
    actual: number,
    sig: { minArgs: number; maxArgs: number; paramNames: string[] }
  ): BoundaryTriangulationResult {
    const range = sig.minArgs === sig.maxArgs ? `${sig.minArgs}` : `${sig.minArgs}-${sig.maxArgs}`;
    return {
      isBoundaryDefect: true,
      discrepancyType: 'ARITY_MISMATCH',
      actualArgCount: actual,
      expectedMinArgs: sig.minArgs,
      expectedMaxArgs: sig.maxArgs,
      explanation: `[${c.library}] '${c.symbol}' expects ${range} arguments, but received ${actual}.`,
      falsifiableHypothesis: `Hypothesis [ARITY_MISMATCH]: Arity mismatch calling '${c.symbol}' (${actual} args supplied, contract requires ${range}). Adjusting parameters will resolve boundary defect.`,
      suggestedAction: `Align invocation arguments with contract signature: ${c.expectedSignature}`
    };
  }

  private static evaluateRuntimeError(c: BoundaryContractContext, err: string): BoundaryTriangulationResult {
    if (/is not a function|has no method|undefined is not a function/i.test(err)) {
      return {
        isBoundaryDefect: true,
        discrepancyType: 'SIGNATURE_MISMATCH',
        explanation: `[${c.library}] '${c.symbol}' is not a callable function in target contract.`,
        falsifiableHypothesis: `Hypothesis [SIGNATURE_MISMATCH]: Method resolution failed for '${c.symbol}'. Verifying export type against '${c.library}' will resolve runtime failure.`,
        suggestedAction: `Verify method existence and export style in '${c.library}'.`
      };
    }
    if (/TypeError|type mismatch|invalid argument|cannot convert|expected .* but received/i.test(err)) {
      return {
        isBoundaryDefect: true,
        discrepancyType: 'TYPE_MISMATCH',
        explanation: `[${c.library}] Type mismatch at boundary for '${c.symbol}': ${err.split('\n')[0]}`,
        falsifiableHypothesis: `Hypothesis [TYPE_MISMATCH]: Argument types supplied to '${c.symbol}' violate expected contract. Harmonizing argument types will eliminate exception.`,
        suggestedAction: `Cast or validate argument types against '${c.expectedSignature || c.symbol}'.`
      };
    }
    return {
      isBoundaryDefect: false,
      discrepancyType: 'NONE',
      explanation: '',
      falsifiableHypothesis: '',
      suggestedAction: ''
    };
  }

  private static findMatchingParen(str: string, openIdx: number): number {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private static splitTokens(str: string, delimiter: string): string[] {
    const tokens: string[] = [];
    let cur = '';
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let inQuote: string | null = null;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inQuote) {
        cur += ch;
        if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inQuote = ch;
        cur += ch;
      } else if (ch === '(') { parenDepth++; cur += ch; }
      else if (ch === ')') { parenDepth--; cur += ch; }
      else if (ch === '<' || ch === '[') { bracketDepth++; cur += ch; }
      else if (ch === '>' || ch === ']') { bracketDepth--; cur += ch; }
      else if (ch === '{') { braceDepth++; cur += ch; }
      else if (ch === '}') { braceDepth--; cur += ch; }
      else if (ch === delimiter && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
        tokens.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) tokens.push(cur.trim());
    return tokens;
  }
}
