export async function crawlNpm(config, { onSkill, onLog, onTotal, checkStop, knownUrls = new Set(), knownNames = new Set() }) {
  const { url, category } = config
  const query = url.startsWith('http') ? new URL(url).searchParams.get('text') || url : url
  onLog(`npm search: ${query}`)
  const res = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=250`,
    { headers: { 'User-Agent': 'skillshub-crawler/2.0' } },
  )
  if (!res.ok) throw new Error(`npm API ${res.status}`)
  const data = await res.json()
  const allPackages = data.objects || []
  onLog(`npm: ${allPackages.length} packages — traitement en cours…`)
  onTotal(allPackages.length)
  for (const obj of allPackages) {
    if (checkStop()) break
    const pkg = obj.package
    onSkill({
      name:             pkg.name,
      description:      (pkg.description || '').slice(0, 500),
      source_url:       `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`,
      source_name:      'npm',
      category:         category || 'MCP Server',
      pricing:          'free',
      version:          pkg.version,
      popularity_score: parseFloat(Math.min(9.9, (obj.score?.final || 0) * 10).toFixed(2)),
      tags:             (pkg.keywords || []).slice(0, 10).map(k => k.toLowerCase()),
    })
  }
}
