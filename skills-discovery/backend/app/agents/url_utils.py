"""URL normalization and relevance filtering."""
import re
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

# Domains to always skip (social, video, tracking…)
SKIP_DOMAINS = {
    "twitter.com", "x.com", "instagram.com", "facebook.com",
    "linkedin.com", "youtube.com", "youtu.be", "tiktok.com",
    "pinterest.com", "snapchat.com", "whatsapp.com", "telegram.org",
    "medium.com/m/", "t.co", "bit.ly", "goo.gl", "ow.ly",
    "amazon.com", "ebay.com", "etsy.com",
}

# Query params to strip (tracking noise)
STRIP_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "ref", "referrer", "source", "fbclid", "gclid", "mc_cid", "mc_eid",
}

# Keywords that suggest a page is about a skill/tool
SKILL_SIGNALS = [
    "mcp", "server", "plugin", "extension", "assistant", "agent",
    "skill", "tool", "sdk", "api", "framework", "library", "package",
    "claude", "copilot", "cursor", "codeium", "tabnine", "aider",
    "modelcontextprotocol", "anthropic", "openai", "llm", "ai",
]


def normalize_url(url: str) -> str:
    """Return a canonical URL for deduplication (lowercase domain, stripped tracking params, no trailing slash)."""
    try:
        p = urlparse(url.strip())
        if not p.scheme or not p.netloc:
            return url.lower().strip()
        netloc = p.netloc.lower().removeprefix("www.")
        path = p.path.rstrip("/") or "/"
        # Strip known tracking query params
        if p.query:
            kept = {k: v for k, v in parse_qs(p.query).items() if k.lower() not in STRIP_PARAMS}
            query = urlencode(kept, doseq=True)
        else:
            query = ""
        return urlunparse((p.scheme.lower(), netloc, path, "", query, ""))
    except Exception:
        return url.lower().strip()


def is_skippable(url: str) -> bool:
    """Return True if the URL should be skipped (social media, binary files, etc.)."""
    try:
        p = urlparse(url)
        domain = p.netloc.lower().removeprefix("www.")
        # Skip known useless domains
        if any(domain == d or domain.endswith("." + d) for d in SKIP_DOMAINS):
            return True
        # Skip binary / non-text file extensions
        path_lower = p.path.lower()
        bad_exts = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
                    ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mp3",
                    ".woff", ".ttf", ".eot", ".exe", ".dmg")
        if any(path_lower.endswith(e) for e in bad_exts):
            return True
        return False
    except Exception:
        return True


def is_relevant(url: str, title: str = "", context: str = "") -> bool:
    """Heuristic: does this URL likely contain a skill/tool page?"""
    text = (url + " " + title + " " + context).lower()
    hits = sum(1 for sig in SKILL_SIGNALS if sig in text)
    return hits >= 1


def extract_urls_from_text(text: str, base_domain: str = "") -> list[str]:
    """Extract all http(s) URLs from a block of text."""
    pattern = r'https?://[^\s\'"<>)\]`]+'
    raw = re.findall(pattern, text)
    cleaned = []
    for url in raw:
        url = url.rstrip(".,;:!?)")
        if not is_skippable(url):
            cleaned.append(url)
    return list(dict.fromkeys(cleaned))  # deduplicate order-preserving
