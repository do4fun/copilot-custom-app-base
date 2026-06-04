from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TagOut(BaseModel):
    id: int
    name: str


class NoteOut(BaseModel):
    id: int
    skill_id: int
    content: str
    created_at: str


class NoteCreate(BaseModel):
    content: str = Field(..., min_length=1)


class SkillBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    pricing: str = "free"
    price_details: Optional[str] = None
    features: str = "[]"
    install_instructions: Optional[str] = None
    version: Optional[str] = None
    popularity_score: float = 0.0


class SkillCreate(SkillBase):
    tags: Optional[List[str]] = []


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    pricing: Optional[str] = None
    price_details: Optional[str] = None
    features: Optional[str] = None
    install_instructions: Optional[str] = None
    version: Optional[str] = None
    popularity_score: Optional[float] = None
    tags: Optional[List[str]] = None


class SkillOut(SkillBase):
    id: int
    is_active: int
    last_checked: Optional[str] = None
    created_at: str
    updated_at: str
    tags: List[TagOut] = []
    is_favorite: bool = False

    class Config:
        from_attributes = True


class SkillDetailOut(SkillOut):
    notes: List[NoteOut] = []
    combinations: List[dict] = []


class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionOut(CollectionBase):
    id: int
    created_at: str
    skills: List[SkillOut] = []

    class Config:
        from_attributes = True


class GoalRequest(BaseModel):
    goal: str = Field(..., min_length=5)


class TaskSkillMatch(BaseModel):
    task: str
    description: str
    skills: List[SkillOut] = []


class GoalDecomposeResponse(BaseModel):
    goal: str
    tasks: List[TaskSkillMatch]
    summary: str


class ComparatorRequest(BaseModel):
    skill_ids: List[int] = Field(..., min_items=2, max_items=3)


class SearchFilters(BaseModel):
    q: Optional[str] = None
    category: Optional[str] = None
    pricing: Optional[str] = None
    tags: Optional[str] = None
    page: int = 1
    page_size: int = 20


class PaginatedSkills(BaseModel):
    total: int
    page: int
    page_size: int
    skills: List[SkillOut]
