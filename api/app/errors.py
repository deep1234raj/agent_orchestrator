"""Domain exceptions and FastAPI exception handlers.

Routes raise these instead of HTTPException directly. The handlers
translate them into consistent error envelopes. This keeps routes
focused on the happy path and the error shape consistent.

Error envelope:
    {"detail": "<message>", "code": "<short-symbol>"}
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class DomainError(Exception):
    """Base for application errors that map to specific HTTP statuses."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "domain_error"


class NotFound(DomainError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class Conflict(DomainError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class BadRequest(DomainError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the handlers below to the app."""

    @app.exception_handler(DomainError)
    async def _domain_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc), "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic v2 may embed non-serialisable exception objects in the
        # `ctx` field. Stringify them before handing off to JSON.
        def _sanitize(errors: list) -> list:
            sanitized = []
            for err in errors:
                entry = dict(err)
                if "ctx" in entry:
                    entry["ctx"] = {
                        k: str(v) if isinstance(v, Exception) else v
                        for k, v in entry["ctx"].items()
                    }
                sanitized.append(entry)
            return sanitized

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": "Validation failed.",
                "code": "validation_error",
                "errors": _sanitize(exc.errors()),
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": "http_error"},
        )
