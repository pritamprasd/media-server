"""Pluggable task type registry.

Each task type is a Python module in this package that calls `register()`
to define its name, form schema, and execution function.

The registry is populated on first access so that importing task_types
doesn't trigger circular imports with Flask / SQLAlchemy.
"""

_registry = {}
_loaded = False


def _ensure_loaded():
    global _loaded
    if _loaded:
        return
    _loaded = True
    import importlib
    import pkgutil
    import app.task_types as pkg
    for _, mod_name, _ in pkgutil.iter_modules(pkg.__path__):
        importlib.import_module(f"app.task_types.{mod_name}")


def register(task_type, config):
    """Register a task type. Called by each task_type module at import time.

    config must contain:
      - name:           Display name (str)
      - description:    Short description (str)
      - fields:         List of field dicts (key, label, type, required, placeholder, help, options)
      - execute(task):  Callable that runs the task (receives TaskRun row)
      - validate(data): Optional callable; returns (ok: bool, error: str|None)
    """
    _registry[task_type] = config


def get_all():
    """Return dict of all registered task types."""
    _ensure_loaded()
    return dict(_registry)


def get(task_type):
    """Return a single task type config, or None."""
    _ensure_loaded()
    return _registry.get(task_type)


def get_schema(task_type):
    """Return just the field schema for a task type."""
    tt = get(task_type)
    if not tt:
        return []
    return tt.get("fields", [])


def list_types():
    """Return list of {key, name, description} for UI dropdowns."""
    _ensure_loaded()
    return [
        {"key": k, "name": v["name"], "description": v["description"]}
        for k, v in _registry.items()
    ]
