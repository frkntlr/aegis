import ts from 'typescript';
import type { SymbolIndexer } from './symbol-indexer.js';

export interface AmbientEnrichment {
  headerLines: string[];
  referencedTypes: string[];
}

export class SliceAmbientEnricher {
  public static enrichTypeScript(
    symbolName: string,
    filePath: string,
    content: string,
    indexer?: SymbolIndexer
  ): AmbientEnrichment {
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const headerLines: string[] = [];
    const referencedTypes: string[] = [];

    const targetNode = this.findTargetNode(sf, symbolName);
    if (!targetNode) return { headerLines, referencedTypes };

    this.enrichDocstrings(targetNode, sf, headerLines);
    this.enrichOverloads(sf, symbolName, targetNode, headerLines);
    this.enrichClassContext(targetNode, sf, headerLines);
    this.enrichReferencedTypes(targetNode, sf, indexer, referencedTypes, headerLines);
    this.enrichModuleConstants(targetNode, sf, headerLines);

    return { headerLines, referencedTypes };
  }

  private static findTargetNode(sf: ts.SourceFile, name: string): ts.Node | null {
    let result: ts.Node | null = null;
    const baseName = name.includes('.') ? name.split('.').pop()! : name;
    const walk = (n: ts.Node): void => {
      if (result) return;
      if (
        (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isClassDeclaration(n)) &&
        n.name?.getText(sf) === baseName
      ) {
        result = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return result;
  }

  private static enrichDocstrings(node: ts.Node, sf: ts.SourceFile, out: string[]): void {
    const fullText = sf.getFullText();
    const comments = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (!comments || comments.length === 0) return;
    const docComments: string[] = [];
    for (const c of comments) {
      const text = fullText.slice(c.pos, c.end);
      if (text.includes('@param') || text.includes('@returns') || text.includes('@throws') || text.includes('@deprecated')) {
        docComments.push(text);
      }
    }
    if (docComments.length > 0) {
      out.push('// 📖 [JSDoc / TSDoc Contracts]', ...docComments);
    }
  }

  private static enrichOverloads(sf: ts.SourceFile, _name: string, target: ts.Node, out: string[]): void {
    if (!ts.isFunctionDeclaration(target)) return;
    const overloads: string[] = [];
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name?.getText(sf) === target.name?.getText(sf) && !stmt.body) {
        overloads.push(stmt.getText(sf));
      }
    }
    if (overloads.length > 0) {
      out.push('// 🔀 [Overload Signatures]', ...overloads.map(o => `// ${o}`));
    }
  }

  private static enrichClassContext(node: ts.Node, sf: ts.SourceFile, out: string[]): void {
    if (!ts.isMethodDeclaration(node) && !ts.isPropertyDeclaration(node)) return;
    const parentClass = node.parent;
    if (!parentClass || !ts.isClassDeclaration(parentClass)) return;

    const fields: string[] = [];
    let constructorSig = '';
    for (const member of parentClass.members) {
      if (ts.isPropertyDeclaration(member) && member.name) {
        const typeStr = member.type ? `: ${member.type.getText(sf)}` : '';
        fields.push(`  ${member.name.getText(sf)}${typeStr};`);
      } else if (ts.isConstructorDeclaration(member) && !constructorSig) {
        const params = member.parameters.map(p => p.getText(sf)).join(', ');
        constructorSig = `  constructor(${params});`;
      }
    }
    if (fields.length > 0 || constructorSig) {
      out.push(`// 🏛️ [Class Context: ${parentClass.name?.getText(sf) || 'Anonymous'}]`);
      if (constructorSig) out.push(`// ${constructorSig}`);
      if (fields.length > 0) out.push(...fields.slice(0, 8).map(f => `// ${f}`));
    }
  }

  private static enrichReferencedTypes(
    node: ts.Node,
    _sf: ts.SourceFile,
    indexer: SymbolIndexer | undefined,
    typesOut: string[],
    out: string[]
  ): void {
    if (!indexer) return;
    const identifiers = new Set<string>();
    const collectTypes = (n: ts.Node) => {
      if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) {
        identifiers.add(n.typeName.text);
      }
      ts.forEachChild(n, collectTypes);
    };
    ts.forEachChild(node, collectTypes);

    const typeSignatures: string[] = [];
    for (const id of identifiers) {
      if (['string', 'number', 'boolean', 'any', 'void', 'Promise', 'Array', 'Record', 'Set', 'Map'].includes(id)) continue;
      const matches = indexer.findSymbols(id);
      for (const m of matches) {
        if (m.kind === 'interface' || m.kind === 'class') {
          typeSignatures.push(`// ${m.signature} [from ${m.filePath}]`);
          typesOut.push(id);
          break;
        }
      }
      if (typeSignatures.length >= 5) break;
    }
    if (typeSignatures.length > 0) {
      out.push('// 📦 [Referenced Type Definitions]', ...typeSignatures);
    }
  }

  private static enrichModuleConstants(node: ts.Node, sf: ts.SourceFile, out: string[]): void {
    const nodeText = node.getText(sf);
    const constDecls: string[] = [];
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const varName = decl.name.text;
          if (varName === varName.toUpperCase() && varName.length > 2 && nodeText.includes(varName)) {
            constDecls.push(`// const ${varName} = ${decl.initializer?.getText(sf) || '...'};`);
          }
        }
      }
    }
    if (constDecls.length > 0) {
      out.push('// ⚙️ [Module Constants]', ...constDecls.slice(0, 5));
    }
  }

  public static sanitizeTemplateLiterals(lines: string[], from: number, to: number): string[] {
    const result = [...lines];
    let backtickCount = 0;
    for (let i = from - 1; i < to; i++) {
      if (i >= 0 && i < result.length) {
        const matches = result[i].match(/`/g);
        if (matches) backtickCount += matches.length;
      }
    }
    if (backtickCount % 2 !== 0 && to <= result.length) {
      result[to - 1] += ' /* ` [unclosed template literal closed for AST safety] */';
    }
    return result;
  }
}
