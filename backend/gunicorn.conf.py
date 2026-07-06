import os

from app.metrics import start_metrics_server


def when_ready(server):
    port = int(os.environ.get("FLASK_METRICS_PORT", 9200))
    start_metrics_server(port)
