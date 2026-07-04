import os
import time
import atexit

from prometheus_client import (
    Counter, Histogram, Gauge, generate_latest,
    CollectorRegistry, CONTENT_TYPE_LATEST,
)

_mp_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
if _mp_dir:
    os.makedirs(_mp_dir, exist_ok=True)

_serving_registry = None

def _get_serving_registry():
    global _serving_registry
    if _serving_registry is not None:
        return _serving_registry
    _serving_registry = CollectorRegistry()
    if _mp_dir:
        from prometheus_client.multiprocess import MultiProcessCollector
        MultiProcessCollector(_serving_registry)
    return _serving_registry

def metrics_view():
    return generate_latest(_get_serving_registry()), 200, {"Content-Type": CONTENT_TYPE_LATEST}

def start_metrics_server(port):
    from prometheus_client import start_http_server as _start
    _start(port, registry=_get_serving_registry())

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds", "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
)
http_requests_total = Counter(
    "http_requests_total", "Total HTTP requests",
    ["method", "endpoint", "status"],
)
http_requests_in_flight = Gauge(
    "http_requests_in_flight", "Current HTTP requests in flight",
    ["method"],
)

celery_tasks_total = Counter(
    "celery_tasks_total", "Total Celery tasks processed",
    ["task", "state"],
)
celery_task_duration_seconds = Histogram(
    "celery_task_duration_seconds", "Celery task duration in seconds",
    ["task"],
)
celery_task_retries_total = Counter(
    "celery_task_retries_total", "Total Celery task retries",
    ["task"],
)

files_imported_total = Counter(
    "files_imported_total", "Total files imported",
)
files_deleted_total = Counter(
    "files_deleted_total", "Total files deleted",
)
files_served_total = Counter(
    "files_served_total", "Total file serve requests",
)
files_downloaded_total = Counter(
    "files_downloaded_total", "Total file downloads",
)
files_edited_total = Counter(
    "files_edited_total", "Total file edit operations",
)
files_exported_total = Counter(
    "files_exported_total", "Total file exports by format",
    ["format"],
)
uploads_total = Counter(
    "uploads_total", "Total files uploaded",
)
upload_bytes_total = Counter(
    "upload_bytes_total", "Total bytes uploaded",
)
metadata_extracted_total = Counter(
    "metadata_extracted_total", "Total metadata extractions",
)
metadata_failed_total = Counter(
    "metadata_failed_total", "Total failed metadata extractions",
)
thumbnails_generated_total = Counter(
    "thumbnails_generated_total", "Total thumbnails generated",
)
ai_descriptions_total = Counter(
    "ai_descriptions_total", "Total AI descriptions generated",
)
ai_failed_total = Counter(
    "ai_failed_total", "Total failed AI generations",
)
faces_detected_total = Counter(
    "faces_detected_total", "Total faces detected",
)
persons_created_total = Counter(
    "persons_created_total", "Total persons created",
)
face_scans_total = Counter(
    "face_scans_total", "Total face scan operations",
)
explorer_operations_total = Counter(
    "explorer_operations_total", "Total explorer operations by type",
    ["operation"],
)
geocode_requests_total = Counter(
    "geocode_requests_total", "Total geocode requests by cache status",
    ["cache"],
)
db_connection_pool_size = Gauge(
    "db_connection_pool_size", "Database connection pool size",
)
library_files_total = Gauge(
    "library_files_total", "Total files in library by status",
    ["status"],
)
library_size_bytes = Gauge(
    "library_size_bytes", "Total library size in bytes",
)
library_sessions_total = Gauge(
    "library_sessions_total", "Total import sessions",
)
tags_total = Gauge(
    "tags_total", "Total unique tags in library",
)
tagged_files_total = Gauge(
    "tagged_files_total", "Total files with at least one tag",
)

def init_flask_metrics(app):
    from flask import request

    @app.before_request
    def _track_request_start():
        request._prometheus_start = time.time()
        http_requests_in_flight.labels(method=request.method).inc()

    @app.after_request
    def _track_request_end(response):
        if hasattr(request, "_prometheus_start"):
            duration = time.time() - request._prometheus_start
            rule = str(request.url_rule) if request.url_rule else request.path
            http_request_duration_seconds.labels(
                method=request.method, endpoint=rule, status=response.status_code,
            ).observe(duration)
            http_requests_total.labels(
                method=request.method, endpoint=rule, status=response.status_code,
            ).inc()
        http_requests_in_flight.labels(method=request.method).dec()
        return response

    app.add_url_rule("/metrics", "metrics", metrics_view)

def instrument_celery(celery_app):
    import celery.signals as signals

    _task_start_times = {}

    @signals.task_prerun.connect
    def _on_task_prerun(task_id, task, **kwargs):
        _task_start_times[task_id] = time.time()

    @signals.task_postrun.connect
    def _on_task_postrun(task_id, task, **kwargs):
        start = _task_start_times.pop(task_id, None)
        if start:
            duration = time.time() - start
            celery_task_duration_seconds.labels(task=task.name).observe(duration)

    @signals.task_success.connect
    def _on_task_success(sender, **kwargs):
        celery_tasks_total.labels(task=sender.name, state="success").inc()

    @signals.task_failure.connect
    def _on_task_failure(sender, **kwargs):
        celery_tasks_total.labels(task=sender.name, state="failure").inc()

    @signals.task_retry.connect
    def _on_task_retry(sender, **kwargs):
        celery_task_retries_total.labels(task=sender.name).inc()

    @signals.worker_ready.connect
    def _on_worker_ready(**kwargs):
        port = int(os.environ.get("WORKER_METRICS_PORT", 9201))
        start_metrics_server(port)
