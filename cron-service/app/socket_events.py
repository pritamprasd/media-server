from flask import request
from flask_socketio import join_room


def register_events(sio):
    @sio.on("join_task")
    def on_join_task(data):
        task_id = data.get("task_id")
        if task_id:
            join_room(f"task_{task_id}")

    @sio.on("connect")
    def on_connect():
        pass

    @sio.on("disconnect")
    def on_disconnect():
        pass
