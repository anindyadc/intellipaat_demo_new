import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.project import Project
from app.models.environment import Environment
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.core.dependencies import get_current_user, require_editor
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(prefix="/projects", tags=["projects"])


def _slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug


async def _get_project_or_404(project_id: str, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _enrich(project: Project, db: AsyncSession) -> ProjectResponse:
    count_result = await db.execute(
        select(func.count(Environment.id)).where(Environment.project_id == project.id)
    )
    env_count = count_result.scalar() or 0
    data = ProjectResponse.model_validate(project)
    data.environment_count = env_count
    return data


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    base_slug = _slugify(payload.name)
    slug = base_slug
    i = 1
    while True:
        existing = await db.execute(select(Project).where(Project.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{i}"
        i += 1

    project = Project(
        **payload.model_dump(),
        slug=slug,
        owner_id=current_user.id,
    )
    db.add(project)
    await db.flush()
    await log_action(db, current_user.id, "CREATE", "project", project.id, project.name)
    return await _enrich(project, db)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    projects = result.scalars().all()
    return [await _enrich(p, db) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(project_id, db)
    return await _enrich(project, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    project = await _get_project_or_404(project_id, db)
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(project, field, val)
    await log_action(db, current_user.id, "UPDATE", "project", project.id, project.name)
    return await _enrich(project, db)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    project = await _get_project_or_404(project_id, db)
    await log_action(db, current_user.id, "DELETE", "project", project.id, project.name)
    await db.delete(project)
