from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import aiosqlite
import os
import json

from ..database import get_db
from ..models import GoalRequest, GoalDecomposeResponse, TaskSkillMatch, SkillOut, TagOut

router = APIRouter()


async def fetch_tags_for_skill(db: aiosqlite.Connection, skill_id: int) -> List[TagOut]:
    async with db.execute(
        """SELECT t.id, t.name FROM tags t
           JOIN skill_tags st ON st.tag_id = t.id
           WHERE st.skill_id = ?""",
        (skill_id,)
    ) as cursor:
        rows = await cursor.fetchall()
        return [TagOut(id=r["id"], name=r["name"]) for r in rows]


async def row_to_skill(db: aiosqlite.Connection, row) -> SkillOut:
    tags = await fetch_tags_for_skill(db, row["id"])
    async with db.execute("SELECT 1 FROM favorites WHERE skill_id = ?", (row["id"],)) as fav:
        is_fav = await fav.fetchone() is not None
    return SkillOut(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        category=row["category"],
        source_url=row["source_url"],
        source_name=row["source_name"],
        pricing=row["pricing"] or "free",
        price_details=row["price_details"],
        features=row["features"] or "[]",
        install_instructions=row["install_instructions"],
        version=row["version"],
        last_checked=row["last_checked"],
        is_active=row["is_active"],
        popularity_score=row["popularity_score"] or 0.0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        tags=tags,
        is_favorite=is_fav,
    )


async def search_skills_for_task(db: aiosqlite.Connection, task_keywords: str) -> List[SkillOut]:
    """Search the local DB for skills relevant to a task description."""
    try:
        async with db.execute(
            """SELECT s.* FROM skills s
               WHERE s.id IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?)
               AND s.is_active = 1
               ORDER BY s.popularity_score DESC
               LIMIT 3""",
            (task_keywords + "*",)
        ) as cursor:
            rows = await cursor.fetchall()
        if rows:
            return [await row_to_skill(db, row) for row in rows]
    except Exception:
        pass

    # Fallback: simple LIKE search
    words = task_keywords.strip().split()[:3]
    if not words:
        return []

    conditions = " OR ".join(
        f"(s.name LIKE ? OR s.description LIKE ?)" for _ in words
    )
    params = []
    for w in words:
        params.extend([f"%{w}%", f"%{w}%"])
    params.append(3)

    try:
        async with db.execute(
            f"""SELECT s.* FROM skills s
                WHERE ({conditions}) AND s.is_active = 1
                ORDER BY s.popularity_score DESC
                LIMIT ?""",
            params
        ) as cursor:
            rows = await cursor.fetchall()
        return [await row_to_skill(db, row) for row in rows]
    except Exception:
        return []


@router.post("/decompose", response_model=GoalDecomposeResponse)
async def decompose_goal(
    goal_req: GoalRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    # Get all skills from DB to provide context to Claude
    async with db.execute(
        "SELECT id, name, description, category, pricing FROM skills WHERE is_active = 1 ORDER BY popularity_score DESC LIMIT 50"
    ) as cursor:
        skill_rows = await cursor.fetchall()

    skills_context = "\n".join(
        f"- {r['name']} ({r['category']}, {r['pricing']}): {r['description'] or 'No description'}"
        for r in skill_rows
    )

    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            prompt = f"""You are a helpful AI assistant that helps developers find the right tools and skills for their goals.

The user has the following goal:
"{goal_req.goal}"

Here is a list of available AI skills and tools in our database:
{skills_context}

Please:
1. Break down the goal into 3-5 concrete sub-tasks
2. For each sub-task, identify 1-3 relevant skills from the list above (use exact skill names)
3. Return your response as valid JSON in this exact format:
{{
  "summary": "Brief summary of the overall approach",
  "tasks": [
    {{
      "task": "Task title",
      "description": "What this task involves and why",
      "skill_names": ["SkillName1", "SkillName2"]
    }}
  ]
}}

Only reference skills that exist in the provided list. If no skills match a task, use an empty array."""

            message = client.messages.create(
                model="claude-opus-4-8",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = message.content[0].text
            # Extract JSON from response
            import re
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
            else:
                parsed = json.loads(response_text)

            tasks: List[TaskSkillMatch] = []
            for task_data in parsed.get("tasks", []):
                skill_names = task_data.get("skill_names", [])
                matched_skills = []
                for sname in skill_names:
                    async with db.execute(
                        "SELECT * FROM skills WHERE LOWER(name) = LOWER(?) AND is_active = 1",
                        (sname,)
                    ) as cursor:
                        row = await cursor.fetchone()
                    if row:
                        matched_skills.append(await row_to_skill(db, row))
                    else:
                        # Try partial match
                        fallback = await search_skills_for_task(db, sname)
                        if fallback:
                            matched_skills.append(fallback[0])

                tasks.append(TaskSkillMatch(
                    task=task_data.get("task", ""),
                    description=task_data.get("description", ""),
                    skills=matched_skills[:3],
                ))

            return GoalDecomposeResponse(
                goal=goal_req.goal,
                tasks=tasks,
                summary=parsed.get("summary", ""),
            )

        except Exception as e:
            # Fall through to rule-based fallback
            pass

    # Rule-based fallback when no API key or API fails
    tasks = await _rule_based_decompose(goal_req.goal, db)
    return GoalDecomposeResponse(
        goal=goal_req.goal,
        tasks=tasks,
        summary=f"Goal decomposed into {len(tasks)} actionable tasks with recommended tools.",
    )


async def _rule_based_decompose(goal: str, db: aiosqlite.Connection) -> List[TaskSkillMatch]:
    """Provide a rule-based goal decomposition when Claude API is unavailable."""
    goal_lower = goal.lower()

    task_templates = []

    if any(kw in goal_lower for kw in ["api", "rest", "backend", "server", "endpoint"]):
        task_templates = [
            ("Design API structure", "Plan endpoints, data models, and authentication strategy",
             ["GitHub Copilot", "Continue.dev", "Codeium"]),
            ("Implement backend logic", "Write the core server code and business logic",
             ["GitHub Copilot", "Cursor", "Amazon CodeWhisperer"]),
            ("Set up database", "Configure and connect to a database",
             ["postgres MCP", "GitHub Copilot", "Continue.dev"]),
            ("Write tests", "Create unit and integration tests for the API",
             ["GitHub Copilot", "code-review", "Cursor"]),
            ("Document and deploy", "Generate API docs and deploy to production",
             ["GitHub Copilot", "fetch MCP", "brave-search MCP"]),
        ]
    elif any(kw in goal_lower for kw in ["web", "frontend", "react", "ui", "interface"]):
        task_templates = [
            ("Set up project structure", "Initialize the frontend project with proper tooling",
             ["GitHub Copilot", "Cursor", "Continue.dev"]),
            ("Build UI components", "Create reusable React/UI components",
             ["GitHub Copilot", "Cursor", "Codeium"]),
            ("Handle state management", "Implement app state and data flow",
             ["GitHub Copilot", "Continue.dev", "Sourcegraph Cody"]),
            ("Connect to backend", "Integrate with APIs and handle async data",
             ["GitHub Copilot", "Cursor", "fetch MCP"]),
            ("Test and optimize", "Write tests and improve performance",
             ["GitHub Copilot", "code-review", "Cursor"]),
        ]
    elif any(kw in goal_lower for kw in ["research", "find", "search", "information", "learn"]):
        task_templates = [
            ("Search for relevant sources", "Find authoritative information on the topic",
             ["brave-search MCP", "fetch MCP", "Perplexity"]),
            ("Deep dive into specifics", "Research technical details and nuances",
             ["Perplexity", "Phind", "You.com"]),
            ("Synthesize findings", "Combine information from multiple sources",
             ["NotebookLM", "Perplexity", "ChatGPT plugins"]),
        ]
    elif any(kw in goal_lower for kw in ["automate", "script", "workflow", "pipeline"]):
        task_templates = [
            ("Identify automation opportunities", "Map out repetitive tasks to automate",
             ["GitHub Copilot", "Cursor", "Continue.dev"]),
            ("Write automation scripts", "Create scripts for each automation task",
             ["GitHub Copilot", "Amazon CodeWhisperer", "Codeium"]),
            ("Set up orchestration", "Connect automation steps into a pipeline",
             ["memory MCP", "sequential-thinking MCP", "GitHub Copilot"]),
            ("Test and monitor", "Verify automation works and add monitoring",
             ["GitHub Copilot", "code-review", "puppeteer MCP"]),
        ]
    else:
        task_templates = [
            ("Understand requirements", "Break down and clarify the goal requirements",
             ["GitHub Copilot", "Perplexity", "ChatGPT plugins"]),
            ("Research solutions", "Find relevant tools and approaches",
             ["brave-search MCP", "Perplexity", "Phind"]),
            ("Implement solution", "Build or configure the chosen approach",
             ["GitHub Copilot", "Cursor", "Continue.dev"]),
            ("Review and refine", "Test, review, and improve the implementation",
             ["code-review", "GitHub Copilot", "Sourcegraph Cody"]),
        ]

    tasks = []
    for task_title, task_desc, skill_names in task_templates:
        matched_skills = []
        for sname in skill_names:
            async with db.execute(
                "SELECT * FROM skills WHERE LOWER(name) = LOWER(?) AND is_active = 1",
                (sname,)
            ) as cursor:
                row = await cursor.fetchone()
            if row:
                matched_skills.append(await row_to_skill(db, row))
            if len(matched_skills) >= 3:
                break

        tasks.append(TaskSkillMatch(
            task=task_title,
            description=task_desc,
            skills=matched_skills,
        ))

    return tasks
