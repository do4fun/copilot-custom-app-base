/** Crawl du registry npm via /v1/search. config.url = texte de recherche. */
export async function crawlNpm(config, ctx) {
  const query = encodeURIComponent(config.url)
  ctx.onLog(`Recherche npm : ${config.url}`)

  const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}&size=100`)
  if (!res.ok) throw new Error(`npm registry ${res.status}`)
  const { objects, total } = await res.json()

  ctx.onLog(`${objects.length} packages trouvés (total: ${total})`)
  ctx.onTotal(objects.length)

  for (const { package: pkg, score } of objects) {
    if (ctx.checkStop()) return
    await ctx.waitWhilePaused()
    if (ctx.checkStop()) return

    try {
      await ctx.onSkill({
        name: pkg.name,
        description: pkg.description || pkg.name,
        source_url: `https://www.npmjs.com/package/${pkg.name}`,
        category: config.category,
        pricing: 'free',
        version: pkg.version || null,
        popularity_score: Math.min((score?.final || 0) * 10, 9.9),
        tags: pkg.keywords || [],
        install_instructions: `npm install ${pkg.name}`,
      })
    } catch (err) {
      ctx.onFail(`${pkg.name} : ${err.message}`)
    }
  }
}
