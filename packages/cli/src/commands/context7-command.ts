import { Context7Bridge } from '@aegis/github-live';
import { showBanner } from './banner.js';

export function handleContext7Query(library?: string, topic?: string): void {
  showBanner();
  if (!library || !topic) {
    console.error('❌ Usage: aegis context7:query "<library>" "<topic>"');
    console.error('   Example: aegis context7:query godot4 lifecycle');
    process.exit(1);
  }

  const bridge = new Context7Bridge();
  const res = bridge.query(library, topic);

  if (!res.matched || !res.doc) {
    console.log(`⚠️  No Context7 documentation found for [${library}] topic: "${topic}".`);
    return;
  }

  const doc = res.doc;
  console.log(`📚 Context7 Documentation [${doc.library.toUpperCase()} v${doc.version}]`);
  console.log(` • Topic:    ${doc.topic}`);
  console.log(` • Summary:  ${doc.summary}`);
  console.log(' • Key Signatures:');
  for (const s of doc.signatures) console.log(`   - ${s}`);

  if (doc.codeExample) {
    console.log('\n • Code Example:');
    console.log(doc.codeExample.split('\n').map(l => `   ${l}`).join('\n'));
  }

  if (doc.breakingChanges && doc.breakingChanges.length > 0) {
    console.log('\n • Breaking Changes:');
    for (const b of doc.breakingChanges) console.log(`   ⚠️  ${b}`);
  }
}
