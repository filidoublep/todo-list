// ===== API config =====
const API_BASE = 'http://localhost:8787'; // later: your Render URL

// stable per-browser user id; share this across your devices if you want same list
let USER_ID = localStorage.getItem('todo_user_id');
if (!USER_ID) {
  USER_ID = crypto.randomUUID();
  localStorage.setItem('todo_user_id', USER_ID);
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': USER_ID
  };
}

const confirmDanger = (msg) => window.confirm(msg);

// Each task: { id, title, done, createdAt }
// Each archived task: same + archivedAt

let state = [];   // live tasks come from API
let archive = []; // archive stays local for now
let filter = 'all'; // 'all' | 'active' | 'done'

async function fetchTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`, { headers: apiHeaders() });
  state = await res.json();
  render();
}

// ===== Utilities =====
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString(); // simple and local—good enough for now
}

// ===== DOM =====
const listEl         = document.getElementById('list');
const emptyEl        = document.getElementById('empty');
const newTaskEl      = document.getElementById('newTask');
const addBtn         = document.getElementById('addBtn');
const badgeEl        = document.getElementById('badge');
const clearDoneBtn   = document.getElementById('clearDone');
clearDoneBtn.classList.add('archive');
const filterBtns     = [...document.querySelectorAll('.filters .btn')];

const archiveSection = document.getElementById('archive');
const archiveListEl  = document.getElementById('archiveList');
const archiveCountEl = document.getElementById('archiveCount');
const toggleArchive  = document.getElementById('toggleArchive');
const emptyArchiveBtn= document.getElementById('emptyArchive');

let archiveVisible = false;

// ===== Render active list =====
function render() {
  // Filter
  const items = state.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done')   return  t.done;
    return true;
  });

  // Empty state
  emptyEl.style.display = items.length ? 'none' : 'block';

  // Build list
  listEl.innerHTML = '';
  for (const item of items) {
    listEl.appendChild(renderItem(item));
  }

  // Badge (left count)
  const left = state.filter(t => !t.done).length;
  badgeEl.textContent = `${left} left`;

  // Filter button ARIA
  for (const b of filterBtns) {
    b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  }

  // If archive open, refresh it too
  if (archiveVisible) renderArchive();
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = item.id;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'checkbox';
  cb.checked = !!item.done;
  cb.addEventListener('change', () => toggle(item.id));

  const title = document.createElement('div');
  title.className = 'title' + (item.done ? ' done' : '');
  title.textContent = item.title;
  title.title = 'Double-click to edit';
  title.addEventListener('dblclick', () => startEdit(item.id, title));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const del = document.createElement('button');
  del.className = 'btn danger';
  del.type = 'button';
  del.textContent = 'Delete';
  del.addEventListener('click', () => {
    if (!confirmDanger('Delete this task permanently?')) return;
    remove(item.id);
  });

  actions.appendChild(del);
  li.appendChild(cb);
  li.appendChild(title);
  li.appendChild(actions);
  return li;
}

// ===== Render archive list =====
function renderArchive() {
  archiveCountEl.textContent = String(archive.length);
  archiveListEl.innerHTML = '';

  if (archive.length === 0) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="title">No archived tasks</span>`;
    archiveListEl.appendChild(li);
    return;
  }

  for (const t of archive) {
    const li = document.createElement('li');

    const left = document.createElement('div');
    const tTitle = document.createElement('span');
    tTitle.className = 'title';
    tTitle.textContent = t.title;

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = `• archived ${fmtDate(t.archivedAt)}`;

    left.appendChild(tTitle);
    left.appendChild(when);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn restore';
    restoreBtn.type = 'button';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restoreFromArchive(t.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete Forever';
    deleteBtn.addEventListener('click', () => {
      if (!confirmDanger('Permanently delete this archived task? This cannot be undone.')) return;
      deleteForever(t.id);
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(left);
    li.appendChild(actions);
    archiveListEl.appendChild(li);
  }
}

// ===== Mutations (active list) =====
async function add(title) {
  title = (title || '').trim();
  if (!title) return;
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ title })
  });
  const task = await res.json();
  state.unshift(task);
  newTaskEl.value = '';
  render();
}

async function toggle(id) {
  const task = state.find(t => t.id === id);
  if (!task) return;
  const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify({ done: !task.done })
  });
  const updated = await res.json();
  state = state.map(t => t.id === id ? updated : t);
  render();
}

async function remove(id) {
  await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: apiHeaders()
  });
  state = state.filter(t => t.id !== id);
  render();
}

// Move all completed to archive
async function clearDone() {
  const done = state.filter(t => t.done);
  if (done.length === 0) return;

  const now = Date.now();
  archive = [
    ...done.map(t => ({ ...t, archivedAt: now })),
    ...archive
  ];

  await fetch(`${API_BASE}/api/tasks?done=true`, {
    method: 'DELETE',
    headers: apiHeaders()
  });

  state = state.filter(t => !t.done);
  render();
}

// Inline edit
function startEdit(id, titleEl) {
  const original = titleEl.textContent;
  const input = document.createElement('input');
  input.value = original;
  input.style.background = 'transparent';
  input.style.border = '1px solid #334155';
  input.style.borderRadius = '6px';
  input.style.color = 'inherit';
  input.style.padding = '6px 8px';
  input.style.width = '100%';

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const val = input.value.trim();
    const newTitle = val || original;
    await fetch(`${API_BASE}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: apiHeaders(),
      body: JSON.stringify({ title: newTitle })
    });
    await fetchTasks();
  };
  const cancel = () => { render(); };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
}

// ===== Archive actions =====
async function restoreFromArchive(id) {
  const idx = archive.findIndex(t => t.id === id);
  if (idx === -1) return;
  const t = archive[idx];
  archive.splice(idx, 1);
  renderArchive();

  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ title: t.title })
  });
  const created = await res.json();

  if (t.done) {
    await fetch(`${API_BASE}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: apiHeaders(),
      body: JSON.stringify({ done: t.done })
    });
  }

  await fetchTasks();
}

function deleteForever(id) {
  archive = archive.filter(t => t.id !== id);
  renderArchive();
}

// ===== Events =====
addBtn.addEventListener('click', () => add(newTaskEl.value));
newTaskEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') add(newTaskEl.value);
});
clearDoneBtn.addEventListener('click', () => {
  if (!confirmDanger('Move all completed tasks to Archive?')) return;
  clearDone();
});

for (const b of filterBtns) {
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    render();
  });
}

toggleArchive.addEventListener('click', () => {
  archiveVisible = !archiveVisible;
  archiveSection.hidden = !archiveVisible;
  toggleArchive.setAttribute('aria-pressed', String(archiveVisible));
  if (archiveVisible) renderArchive();
});

emptyArchiveBtn.addEventListener('click', () => {
  if (!archive.length) return;
  if (!confirmDanger('Delete ALL archived tasks permanently?')) return;
  archive = [];
  renderArchive();
});

// ===== Initial load =====
fetchTasks();
