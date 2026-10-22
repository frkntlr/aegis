const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function main() {
  console.log('Checking repository frkntlr/aegis on GitHub...');
  const checkRes = await fetch('https://api.github.com/repos/frkntlr/aegis', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Aegis-CLI',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (checkRes.status === 200) {
    const existing = await checkRes.json();
    console.log('✅ Repository already exists:', existing.html_url);
    return;
  }

  console.log('Creating new repository frkntlr/aegis...');
  const createRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Aegis-CLI',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'aegis',
      description: 'Aegis - Autonomous Vibe Coding Engine for Google Antigravity and Web Environments',
      private: false,
      has_issues: true,
      has_projects: true,
      has_wiki: true
    })
  });

  const data = await createRes.json();
  if (createRes.status === 201) {
    console.log('🎉 Repository successfully created:', data.html_url);
  } else {
    console.error(`❌ Failed to create repo [${createRes.status}]:`, data.message || data);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
