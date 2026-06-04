"""
Real web scrapers — fetch live data from GitHub, npm, MCP.so, VS Code marketplace.
Each function returns a list of skill dicts compatible with the skills table.
"""
import json
import re
import httpx
from typing import List, Dict, Any

TIMEOUT = 20
HEADERS = {"User-Agent": "SkillsHub-Discovery/1.0 (github.com/do4fun/skills-discovery)"}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clamp_score(stars: int, base: float = 5.0, per: int = 200) -> float:
    return round(min(9.8, base + stars / per), 1)


async def _get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    r = await client.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    r.raise_for_status()
    return r


# ─────────────────────────────────────────────────────────────────────────────
# 1. awesome-mcp-servers (GitHub README — markdown tables)
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_awesome_mcp() -> List[Dict[str, Any]]:
    url = "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md"
    async with httpx.AsyncClient() as client:
        r = await _get(client, url)

    skills: List[Dict[str, Any]] = []
    seen: set = set()

    # Match markdown table rows: | [Name](url) | description | ... |
    for m in re.finditer(
        r'\|\s*\[([^\]]{2,60})\]\((https?://[^)]+)\)\s*\|([^|\n]*)',
        r.text
    ):
        raw_name, link, desc = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
        desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', desc)  # strip inner markdown links
        desc = re.sub(r'[`*_]', '', desc).strip()

        name = raw_name if raw_name.lower().endswith("mcp") else raw_name + " MCP"
        if name in seen or len(raw_name) < 2:
            continue
        seen.add(name)

        skills.append({
            "name": name,
            "description": desc or f"MCP server: {raw_name}",
            "category": "MCP Server",
            "source_url": link,
            "source_name": "awesome-mcp-servers",
            "pricing": "free",
            "features": json.dumps(["MCP server", "Open source"]),
            "tags": ["mcp", "awesome-mcp", "open-source"],
            "popularity_score": 6.5,
        })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# 2. npm @modelcontextprotocol packages
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_npm_mcp() -> List[Dict[str, Any]]:
    pages = [
        "https://registry.npmjs.org/-/v1/search?text=%40modelcontextprotocol&size=50",
        "https://registry.npmjs.org/-/v1/search?text=mcp-server&size=50",
    ]
    skills: List[Dict[str, Any]] = []
    seen: set = set()

    async with httpx.AsyncClient() as client:
        for url in pages:
            try:
                r = await _get(client, url)
                data = r.json()
            except Exception:
                continue

            for obj in data.get("objects", []):
                pkg = obj.get("package", {})
                pkg_name: str = pkg.get("name", "")
                description: str = pkg.get("description", "") or ""
                keywords: list = pkg.get("keywords", []) or []

                if not pkg_name or pkg_name in seen:
                    continue
                seen.add(pkg_name)

                # Build a readable short name
                short = (
                    pkg_name
                    .replace("@modelcontextprotocol/server-", "")
                    .replace("@modelcontextprotocol/", "")
                    .replace("-mcp-server", "")
                    .replace("-mcp", "")
                    .replace("mcp-server-", "")
                )
                display_name = short.replace("-", " ").title() + " MCP"

                score_data = obj.get("score", {}).get("detail", {})
                pop = score_data.get("popularity", 0)

                tags = list({"mcp", "npm"} | {k.lower() for k in keywords if len(k) < 30})

                skills.append({
                    "name": display_name,
                    "description": description or f"MCP server package: {pkg_name}",
                    "category": "MCP Server",
                    "source_url": f"https://www.npmjs.com/package/{pkg_name}",
                    "source_name": "npm",
                    "pricing": "free",
                    "features": json.dumps(["MCP server", "npm installable"]),
                    "install_instructions": f"npm install -g {pkg_name}",
                    "tags": tags[:8],
                    "popularity_score": round(5.0 + pop * 4, 1),
                })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# 3. GitHub search — mcp-server + model-context-protocol topics
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_github_mcp_topics() -> List[Dict[str, Any]]:
    queries = [
        "https://api.github.com/search/repositories?q=topic:mcp-server&sort=stars&per_page=30",
        "https://api.github.com/search/repositories?q=topic:model-context-protocol&sort=stars&per_page=30",
    ]
    gh_headers = {**HEADERS, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    skills: List[Dict[str, Any]] = []
    seen: set = set()

    async with httpx.AsyncClient() as client:
        for url in queries:
            try:
                r = await client.get(url, headers=gh_headers, timeout=TIMEOUT)
                if r.status_code == 403:
                    break  # rate-limited
                r.raise_for_status()
                data = r.json()
            except Exception:
                continue

            for repo in data.get("items", []):
                full_name: str = repo.get("full_name", "")
                description: str = repo.get("description", "") or ""
                stars: int = repo.get("stargazers_count", 0)
                html_url: str = repo.get("html_url", "")
                topics: list = repo.get("topics", []) or []
                language: str = repo.get("language", "") or ""

                if not full_name or full_name in seen or len(description) < 5:
                    continue
                seen.add(full_name)

                repo_name = repo.get("name", full_name.split("/")[-1])
                display_name = repo_name.replace("-", " ").replace("_", " ").title()
                if not display_name.lower().endswith("mcp"):
                    display_name += " MCP"

                features = ["Open source", f"⭐ {stars} GitHub stars"]
                if language:
                    features.append(f"Written in {language}")

                tags = list({"mcp", "github", "open-source"} | {t.lower() for t in topics[:5]})

                skills.append({
                    "name": display_name,
                    "description": description[:300],
                    "category": "MCP Server",
                    "source_url": html_url,
                    "source_name": f"GitHub / {repo.get('owner', {}).get('login', '')}",
                    "pricing": "free",
                    "features": json.dumps(features),
                    "tags": tags[:8],
                    "popularity_score": _clamp_score(stars),
                })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# 4. GitHub search — AI coding tools & agents
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_github_ai_tools() -> List[Dict[str, Any]]:
    queries = [
        "https://api.github.com/search/repositories?q=topic:ai-agent+topic:coding+stars:%3E100&sort=stars&per_page=20",
        "https://api.github.com/search/repositories?q=topic:llm-agent+language:python+stars:%3E500&sort=stars&per_page=20",
        "https://api.github.com/search/repositories?q=ai+coding+assistant+stars:%3E1000&sort=stars&per_page=15",
    ]
    gh_headers = {**HEADERS, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    skills: List[Dict[str, Any]] = []
    seen: set = set()

    async with httpx.AsyncClient() as client:
        for url in queries:
            try:
                r = await client.get(url, headers=gh_headers, timeout=TIMEOUT)
                if r.status_code == 403:
                    break
                r.raise_for_status()
                data = r.json()
            except Exception:
                continue

            for repo in data.get("items", []):
                full_name: str = repo.get("full_name", "")
                description: str = repo.get("description", "") or ""
                stars: int = repo.get("stargazers_count", 0)
                html_url: str = repo.get("html_url", "")
                topics: list = repo.get("topics", []) or []

                if not full_name or full_name in seen or len(description) < 10:
                    continue
                seen.add(full_name)

                repo_name = repo.get("name", "")
                display_name = repo_name.replace("-", " ").replace("_", " ").title()
                tags = list({"ai-tool", "github", "open-source"} | {t.lower() for t in topics[:5]})

                skills.append({
                    "name": display_name,
                    "description": description[:300],
                    "category": "AI Coding Tool",
                    "source_url": html_url,
                    "source_name": f"GitHub / {repo.get('owner', {}).get('login', '')}",
                    "pricing": "free",
                    "features": json.dumps(["Open source", f"⭐ {stars} stars"]),
                    "tags": tags[:8],
                    "popularity_score": _clamp_score(stars, base=5.0, per=500),
                })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# 5. VS Code Marketplace — AI extensions
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_vscode_ai_extensions() -> List[Dict[str, Any]]:
    url = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery"
    headers = {
        **HEADERS,
        "Accept": "application/json;api-version=7.1-preview.1",
        "Content-Type": "application/json",
    }
    searches = ["AI coding", "Claude", "AI assistant", "code completion AI"]
    skills: List[Dict[str, Any]] = []
    seen: set = set()

    async with httpx.AsyncClient() as client:
        for search_term in searches:
            body = {
                "filters": [{
                    "criteria": [
                        {"filterType": 8, "value": "Microsoft.VisualStudio.Code"},
                        {"filterType": 10, "value": search_term},
                    ],
                    "pageSize": 15,
                    "pageNumber": 1,
                    "sortBy": 4,  # InstallCount
                }],
                "flags": 914,
                "assetTypes": [],
            }
            try:
                r = await client.post(url, json=body, headers=headers, timeout=TIMEOUT)
                r.raise_for_status()
                data = r.json()
            except Exception:
                continue

            for ext in data.get("results", [{}])[0].get("extensions", []):
                display_name: str = ext.get("displayName", "").strip()
                description: str = (ext.get("shortDescription", "") or "").strip()[:250]
                publisher: str = ext.get("publisher", {}).get("displayName", "")
                pub_name: str = ext.get("publisher", {}).get("publisherName", "")
                ext_name: str = ext.get("extensionName", "")
                ext_id = f"{pub_name}.{ext_name}"

                if not display_name or ext_id in seen or len(description) < 10:
                    continue
                seen.add(ext_id)

                stats = {s.get("statisticName"): s.get("value", 0) for s in ext.get("statistics", [])}
                installs = int(stats.get("install", 0))

                skills.append({
                    "name": display_name,
                    "description": description,
                    "category": "AI Coding Tool",
                    "source_url": f"https://marketplace.visualstudio.com/items?itemName={ext_id}",
                    "source_name": f"VS Code Marketplace / {publisher}",
                    "pricing": "freemium",
                    "features": json.dumps(["VS Code extension", "AI assistance", f"{installs:,} installs"]),
                    "install_instructions": f'Install from VS Code: ext install {ext_id}',
                    "tags": ["vscode", "extension", "ai-coding"],
                    "popularity_score": round(min(9.5, 5.0 + installs / 3_000_000), 1),
                })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# 6. Hugging Face Spaces — AI tools/demos
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_huggingface_tools() -> List[Dict[str, Any]]:
    url = "https://huggingface.co/api/spaces?filter=coding&sort=likes&limit=30"
    skills: List[Dict[str, Any]] = []
    seen: set = set()

    async with httpx.AsyncClient() as client:
        try:
            r = await _get(client, url)
            items = r.json()
        except Exception:
            return []

    for space in items:
        sid: str = space.get("id", "")
        description: str = (space.get("cardData", {}) or {}).get("short_description", "") or ""
        tags_raw: list = space.get("tags", []) or []
        likes: int = space.get("likes", 0)

        if not sid or sid in seen or likes < 10:
            continue
        seen.add(sid)

        name = sid.split("/")[-1].replace("-", " ").replace("_", " ").title()
        tags = list({"huggingface", "demo", "ai-tool"} | {t.lower() for t in tags_raw[:4] if len(t) < 25})

        skills.append({
            "name": name,
            "description": description or f"AI Space on Hugging Face: {sid}",
            "category": "AI Productivity Tool",
            "source_url": f"https://huggingface.co/spaces/{sid}",
            "source_name": "Hugging Face Spaces",
            "pricing": "free",
            "features": json.dumps(["Web demo", "AI tool", f"❤ {likes} likes"]),
            "tags": tags[:8],
            "popularity_score": round(min(8.5, 4.0 + likes / 200), 1),
        })

    return skills


# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

WEB_SCRAPERS: Dict[str, Any] = {
    "awesome-mcp":     scrape_awesome_mcp,
    "npm-mcp":         scrape_npm_mcp,
    "github-mcp":      scrape_github_mcp_topics,
    "github-ai-tools": scrape_github_ai_tools,
    "vscode-ai":       scrape_vscode_ai_extensions,
    "huggingface":     scrape_huggingface_tools,
}
