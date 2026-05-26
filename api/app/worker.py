"""Worker — the run dispatcher.

Two coroutines, both started by the FastAPI lifespan:

  run_loop:       polls `runs` for status=PENDING, claims one with
                  SELECT … FOR UPDATE SKIP LOCKED, hands it to the executor.
  scheduler_loop: every N seconds, finds active schedules whose
                  next_fire_at has passed, creates PENDING runs, advances
                  next_fire_at via croniter.

Both are cooperative: each iteration awaits asyncio.sleep so they yield
to the event loop. They handle their own errors and log — they should
never crash the process. A startup sweep marks stale RUNNING rows as
FAILED (orphaned by a previous process crash).

The SKIP LOCKED pattern means we can run multiple workers without
coordination — Postgres handles it. We run one in v1.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from croniter import croniter
from sqlalchemy import and_, select, update
from zoneinfo import ZoneInfo

from app.config import settings
from app.db.session import session_scope
from app.models.enums import RunStatus, ScheduleStatus
from app.models.run import Run
from app.models.schedule import Schedule
from app.runtime.executor import execute_run

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Startup sweep
# ─────────────────────────────────────────────────────────────────────────────


async def orphan_sweep() -> None:
    """Mark long-stuck RUNNING runs as FAILED.

    Called once at startup. Anything RUNNING for more than the configured
    threshold is assumed to have been interrupted by a prior process
    crash. We can't recover it, but we shouldn't leave it visibly stuck
    in the UI either.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=settings.orphan_run_after_minutes
    )
    async with session_scope() as s:
        result = await s.execute(
            update(Run)
            .where(
                and_(
                    Run.status == RunStatus.RUNNING,
                    Run.started_at < cutoff,
                )
            )
            .values(
                status=RunStatus.FAILED,
                error="orphaned: process restarted while run was in progress",
                finished_at=datetime.now(timezone.utc),
            )
            .returning(Run.id)
        )
        orphans = list(result.scalars())
    if orphans:
        log.warning("orphan_runs_swept", count=len(orphans))


# ─────────────────────────────────────────────────────────────────────────────
# Run dispatch
# ─────────────────────────────────────────────────────────────────────────────


async def _claim_one() -> uuid.UUID | None:
    """Atomically pick one PENDING run and flip it to RUNNING.

    Returns the claimed run's id, or None if nothing was pending.

    SKIP LOCKED is the right primitive here: if two workers race, one
    grabs the row and the other moves on without blocking.
    """
    async with session_scope() as s:
        # Find a candidate. with_for_update(skip_locked=True) means we
        # won't wait on another worker that's already claiming this row.
        candidate = await s.execute(
            select(Run.id)
            .where(Run.status == RunStatus.PENDING)
            .order_by(Run.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        run_id = candidate.scalar_one_or_none()
        if run_id is None:
            return None

        # Flip status in the same transaction so the lock matters.
        await s.execute(
            update(Run)
            .where(Run.id == run_id)
            .values(status=RunStatus.RUNNING, started_at=datetime.now(timezone.utc))
        )
        return run_id


async def _dispatch(run_id: uuid.UUID) -> None:
    """Execute a single run. Swallows exceptions — executor handles its own."""
    log.info("run_dispatch", run_id=str(run_id))
    try:
        await execute_run(run_id)
    except Exception:  # noqa: BLE001
        # execute_run already finalizes status on failure; this catch is
        # belt-and-braces so a buggy executor never kills the worker.
        log.exception("run_dispatch_failed", run_id=str(run_id))


async def run_loop(stop_event: asyncio.Event) -> None:
    """Main worker loop. Runs until `stop_event` is set."""
    log.info("worker_started", interval=settings.worker_poll_interval_seconds)
    while not stop_event.is_set():
        try:
            run_id = await _claim_one()
        except Exception:  # noqa: BLE001
            log.exception("worker_claim_failed")
            await asyncio.sleep(settings.worker_poll_interval_seconds)
            continue

        if run_id is None:
            # Nothing pending — wait a beat before polling again. We use
            # wait_for on the stop_event so shutdown is responsive.
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=settings.worker_poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass
            continue

        # Dispatch concurrently so the worker can keep polling while a
        # long-running run executes. In v1 we don't cap concurrency —
        # the LLM and tool layers are I/O-bound, and Postgres handles
        # the rest. Add a Semaphore here when needed.
        asyncio.create_task(_dispatch(run_id))

    log.info("worker_stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler tick
# ─────────────────────────────────────────────────────────────────────────────


async def _fire_due_schedules() -> int:
    """Create PENDING runs for every schedule whose next_fire_at has passed.

    Returns how many fired (for logging).
    """
    now = datetime.now(timezone.utc)
    fired = 0

    async with session_scope() as s:
        result = await s.execute(
            select(Schedule)
            .where(
                and_(
                    Schedule.status == ScheduleStatus.ACTIVE,
                    Schedule.next_fire_at.is_not(None),
                    Schedule.next_fire_at <= now,
                )
            )
            .with_for_update(skip_locked=True)
        )
        schedules = list(result.scalars())

        for sched in schedules:
            s.add(
                Run(
                    workflow_id=sched.workflow_id,
                    status=RunStatus.PENDING,
                    trigger="schedule",
                    input=sched.input,
                )
            )
            sched.last_fired_at = now
            sched.next_fire_at = _advance_next_fire(sched, base=now)
            fired += 1

    return fired


def _advance_next_fire(sched: Schedule, *, base: datetime) -> datetime:
    """Compute the next fire time from the cron expression."""
    tz = ZoneInfo(sched.timezone or "UTC")
    base_local = base.astimezone(tz)
    itr = croniter(sched.cron, base_local)
    return itr.get_next(datetime).astimezone(timezone.utc)


async def scheduler_loop(stop_event: asyncio.Event) -> None:
    """Wake every N seconds, fire any due schedules."""
    log.info("scheduler_started", interval=settings.scheduler_tick_interval_seconds)
    while not stop_event.is_set():
        try:
            fired = await _fire_due_schedules()
            if fired:
                log.info("schedules_fired", count=fired)
        except Exception:  # noqa: BLE001
            log.exception("scheduler_tick_failed")

        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.scheduler_tick_interval_seconds,
            )
        except asyncio.TimeoutError:
            pass

    log.info("scheduler_stopped")
