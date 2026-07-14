// WebSocket connection
const socket = io();

// Track which task rooms we've joined
const joinedRooms = new Set();

function joinTaskRoom(taskId) {
  if (!joinedRooms.has(taskId)) {
    socket.emit('join_task', { task_id: taskId });
    joinedRooms.add(taskId);
  }
}

// Live task output streaming
socket.on('task_progress', function(data) {
  const taskId = data.task_id;
  const outputEl = document.getElementById('output-' + taskId);
  if (!outputEl) return;

  const pre = outputEl.querySelector('pre');
  if (!pre) return;

  pre.textContent += data.line + '\n';
  outputEl.scrollTop = outputEl.scrollHeight;
});

// Task completion notification
socket.on('task_complete', function(data) {
  const taskId = data.task_id;
  const card = document.getElementById('task-' + taskId);
  if (card) {
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className = 'badge badge--' + data.status;
      badge.textContent = data.status;
    }
    const cancelBtn = card.querySelector('.btn--danger');
    if (cancelBtn) cancelBtn.remove();
  }

  // Show summary if available
  if (data.summary) {
    const summaryEl = document.createElement('div');
    summaryEl.className = 'task-card__paths';
    summaryEl.innerHTML = '<strong>Summary:</strong> ' + data.summary;
    if (card) card.appendChild(summaryEl);
  }
});

// Auto-join rooms for visible running tasks on the tasks page
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.task-card--running[data-task-id]').forEach(function(el) {
    joinTaskRoom(parseInt(el.dataset.taskId));
  });
});
