"""Workflow CRUD + run-trigger routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import get_session
from app.errors import Conflict, NotFound
from app.models.enums import RunStatus
from app.models.run import Run
from app.models.workflow import Workflow
from app.schemas.run import RunRead
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowRead,
    WorkflowRunRequest,
    WorkflowUpdate,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowRead])
async def list_workflows(s: AsyncSession = Depends(get_session)) -> list[Workflow]:
    result = await s.execute(select(Workflow).order_by(Workflow.created_at.desc()))
    return list(result.scalars())


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreate, s: AsyncSession = Depends(get_session)) -> Workflow:
    workflow = Workflow(**body.model_dump())
    s.add(workflow)
    try:
        await s.commit()
    except IntegrityError as e:
        await s.rollback()
        raise Conflict("Workflow with this name already exists.") from e
    await s.refresh(workflow)
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(workflow_id: uuid.UUID, s: AsyncSession = Depends(get_session)) -> Workflow:
    workflow = await s.get(Workflow, workflow_id)
    if workflow is None:
        raise NotFound(f"Workflow {workflow_id} not found.")
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    workflow_id: uuid.UUID,
    body: WorkflowUpdate,
    s: AsyncSession = Depends(get_session),
) -> Workflow:
    workflow = await s.get(Workflow, workflow_id)
    if workflow is None:
        raise NotFound(f"Workflow {workflow_id} not found.")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(workflow, field, value)
        if field == "graph":
            flag_modified(workflow, "graph")

    try:
        await s.commit()
    except IntegrityError as e:
        await s.rollback()
        raise Conflict("Update violates a uniqueness constraint.") from e
    await s.refresh(workflow)
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: uuid.UUID, s: AsyncSession = Depends(get_session)) -> None:
    workflow = await s.get(Workflow, workflow_id)
    if workflow is None:
        raise NotFound(f"Workflow {workflow_id} not found.")
    await s.delete(workflow)
    await s.commit()


# ─── Run trigger ─────────────────────────────────────────────────────────────


@router.post(
    "/{workflow_id}/run",
    response_model=RunRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_run(
    workflow_id: uuid.UUID,
    body: WorkflowRunRequest,
    s: AsyncSession = Depends(get_session),
) -> Run:
    """Create a PENDING run. The worker picks it up shortly afterwards.

    Returns 202 with the run object — the caller subscribes to the WS
    for live updates rather than waiting on this response.
    """
    workflow = await s.get(Workflow, workflow_id)
    if workflow is None:
        raise NotFound(f"Workflow {workflow_id} not found.")

    run = Run(
        workflow_id=workflow_id,
        status=RunStatus.PENDING,
        trigger="ui",
        input=body.input,
    )
    s.add(run)
    await s.commit()
    await s.refresh(run)
    return run
