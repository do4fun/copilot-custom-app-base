from typing import List, Dict, Any
from .base import BaseScraper


class ClaudeSkillsScraper(BaseScraper):
    """Scraper for Claude Code built-in skills."""

    async def scrape(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "deep-research",
                "description": "Deep research harness that fans out web searches, fetches sources, adversarially verifies claims, and synthesizes a cited report. Perfect for multi-source fact-checked research on any topic.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Multi-source web search",
                    "Adversarial claim verification",
                    "Cited report synthesis",
                    "Parallel search fan-out",
                    "Source credibility assessment"
                ],
                "install_instructions": "Available as a built-in Claude Code skill. Invoke with /deep-research",
                "popularity_score": 9.5,
                "tags": ["research", "claude-code", "web-search", "analysis", "citations"],
            },
            {
                "name": "verify",
                "description": "Verify that a code change actually works by running the app and observing behavior. Use to verify PRs, confirm fixes, test changes manually, or validate local changes before pushing.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Automated behavior verification",
                    "PR verification",
                    "Manual test execution",
                    "Visual output observation",
                    "Pre-push validation"
                ],
                "install_instructions": "Available as a built-in Claude Code skill. Invoke with /verify",
                "popularity_score": 9.0,
                "tags": ["testing", "claude-code", "verification", "qa", "automation"],
            },
            {
                "name": "code-review",
                "description": "Review current diff for correctness bugs and reuse/simplification/efficiency cleanups at configurable effort levels. Can post findings as inline PR comments or apply fixes directly.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Multi-level effort (low/medium/high/max)",
                    "Bug detection",
                    "Efficiency analysis",
                    "Inline PR comments (--comment flag)",
                    "Auto-fix mode (--fix flag)",
                    "Correctness checks"
                ],
                "install_instructions": "Built-in skill. Use /code-review, /code-review --comment, or /code-review --fix",
                "popularity_score": 9.8,
                "tags": ["code-review", "claude-code", "bugs", "quality", "pr", "automation"],
            },
            {
                "name": "simplify",
                "description": "Review changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes automatically. Focuses on quality improvements rather than bug hunting.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Code simplification",
                    "Reuse detection",
                    "Efficiency improvements",
                    "Auto-apply fixes",
                    "Altitude-aware refactoring"
                ],
                "install_instructions": "Built-in skill. Invoke with /simplify",
                "popularity_score": 8.5,
                "tags": ["refactoring", "claude-code", "simplification", "quality", "cleanup"],
            },
            {
                "name": "run",
                "description": "Launch and drive the project's app to see a change working. Use to run, start, or screenshot the app, or confirm a change works in the real app (not just tests).",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "App launch automation",
                    "Screenshot capture",
                    "Multi-project-type support",
                    "Real-time behavior observation",
                    "Change validation"
                ],
                "install_instructions": "Built-in skill. Invoke with /run",
                "popularity_score": 8.7,
                "tags": ["execution", "claude-code", "testing", "automation", "screenshots"],
            },
            {
                "name": "init",
                "description": "Initialize a new CLAUDE.md file with comprehensive codebase documentation. Analyzes the project and generates structured documentation for Claude Code sessions.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "CLAUDE.md generation",
                    "Codebase analysis",
                    "Project structure documentation",
                    "Tech stack detection",
                    "Auto-documentation"
                ],
                "install_instructions": "Built-in skill. Invoke with /init",
                "popularity_score": 8.0,
                "tags": ["documentation", "claude-code", "initialization", "setup"],
            },
            {
                "name": "review",
                "description": "Review a pull request comprehensively. Analyzes the PR diff, checks for bugs, logic issues, style violations, and provides structured feedback.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "PR diff analysis",
                    "Bug identification",
                    "Logic verification",
                    "Style checking",
                    "Structured feedback"
                ],
                "install_instructions": "Built-in skill. Invoke with /review",
                "popularity_score": 9.0,
                "tags": ["pr-review", "claude-code", "code-quality", "github"],
            },
            {
                "name": "security-review",
                "description": "Complete security review of pending changes on the current branch. Identifies vulnerabilities, injection risks, authentication issues, and security anti-patterns.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Vulnerability detection",
                    "Injection risk analysis",
                    "Auth/authz review",
                    "Security anti-pattern detection",
                    "Dependency risk assessment"
                ],
                "install_instructions": "Built-in skill. Invoke with /security-review",
                "popularity_score": 9.3,
                "tags": ["security", "claude-code", "vulnerabilities", "owasp", "audit"],
            },
            {
                "name": "update-config",
                "description": "Configure the Claude Code harness via settings.json. Set up automated behaviors, hooks, permissions, and environment variables. Essential for customizing Claude Code workflows.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Automated behavior configuration",
                    "Hook setup",
                    "Permission management",
                    "Environment variable setting",
                    "settings.json editing"
                ],
                "install_instructions": "Built-in skill. Invoke with /update-config",
                "popularity_score": 7.5,
                "tags": ["configuration", "claude-code", "hooks", "settings", "automation"],
            },
            {
                "name": "session-start-hook",
                "description": "Create and develop startup hooks for Claude Code on the web. Sets up a SessionStart hook to ensure the project can run tests and linters during web sessions.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Session initialization",
                    "Test runner setup",
                    "Linter configuration",
                    "Web session support",
                    "Auto-environment setup"
                ],
                "install_instructions": "Built-in skill. Invoke with /session-start-hook",
                "popularity_score": 7.0,
                "tags": ["hooks", "claude-code", "session", "testing", "automation"],
            },
            {
                "name": "claude-api",
                "description": "Build, debug, and optimize Claude API and Anthropic SDK applications. Handles prompt caching, model migrations, tool use, batch processing, and all Claude API features.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Prompt caching optimization",
                    "Model version migration",
                    "Tool use implementation",
                    "Batch processing",
                    "Streaming support",
                    "SDK debugging"
                ],
                "install_instructions": "Built-in skill. Invoke with /claude-api",
                "popularity_score": 8.8,
                "tags": ["api", "claude-code", "anthropic", "sdk", "llm", "integration"],
            },
            {
                "name": "keybindings-help",
                "description": "Customize keyboard shortcuts, rebind keys, add chord bindings, or modify keybindings.json. Makes Claude Code more ergonomic with custom key mappings.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Custom keybinding creation",
                    "Chord shortcut support",
                    "keybindings.json management",
                    "Key remapping",
                    "Ergonomic customization"
                ],
                "install_instructions": "Built-in skill. Invoke with /keybindings-help",
                "popularity_score": 6.5,
                "tags": ["keybindings", "claude-code", "customization", "shortcuts", "ux"],
            },
            {
                "name": "loop",
                "description": "Run a prompt or slash command on a recurring interval. Set up recurring tasks, poll for status, or run something repeatedly on an interval like checking deploys every 5 minutes.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Interval-based execution",
                    "Command scheduling",
                    "Deploy monitoring",
                    "Status polling",
                    "Recurring task automation"
                ],
                "install_instructions": "Built-in skill. Invoke with /loop 5m /command",
                "popularity_score": 7.2,
                "tags": ["scheduling", "claude-code", "automation", "monitoring", "recurring"],
            },
            {
                "name": "fewer-permission-prompts",
                "description": "Scan transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project settings.json to reduce permission prompts during Claude Code sessions.",
                "category": "Claude Code Skill",
                "source_url": "https://claude.ai/code",
                "source_name": "Anthropic Claude Code",
                "pricing": "free",
                "features": [
                    "Transcript analysis",
                    "Allowlist generation",
                    "Permission optimization",
                    "settings.json update",
                    "UX improvement"
                ],
                "install_instructions": "Built-in skill. Invoke with /fewer-permission-prompts",
                "popularity_score": 7.8,
                "tags": ["permissions", "claude-code", "configuration", "ux", "optimization"],
            },
        ]
