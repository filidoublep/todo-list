// =============================
//  Config: API + user identity
// =============================
const API_BASE = 'https://todo-backend-393a.onrender.com';

// Shared user ID so all your devices see the same list
const USER_ID = 'filip-main-todo';

// Password to unlock UI (⚠ visible in source!)
const APP_PASSWORD = 'my-secret-todo-password'; // <-- change this to something you remember

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': USER_ID,
  };
}

// archive stays in localStorage for now
const KEY_ARCHIVE = 'universal_todo.archive.v1';

function loadArchive() {
  try {
    return JSON.parse(localStorage.getItem(KEY_ARCHIVE) || '[]');
  } catch {
    return [];
  }
}
function saveArchive() {
  localStorage.setItem(KEY_ARCHIVE, JSON.stringify(archive));
}

// confirmation helper for dangerous actions
const confirmDanger = (msg) => window.confirm(msg);

// =============================
//  State
// =============================
let state = [];              // active tasks -> from backend
let archive = loadArchive(); // archived tasks -> local
let filter = 'all';          // 'all' | 'active' | 'done'
let archiveVisible = false;

// =============================
//  DOM references
// =============================
const listEl         = document.getElementById('list');
const emptyEl        = document.getElementById('empty');
const newTaskEl      = document.getElementById('newTask');
const addBtn         = document.getElementById('addBtn');
const badgeEl        = document.getElementById('badge');
const clearDoneBtn   = document.getElementById('clearDone');
const filterBtns     = [...document.querySelectorAll('.filters .btn')];

const archiveSection = document.getElementById('archive');
const archiveListEl  = document.getElementById('archiveList');
const archiveCountEl = document.getElementById('archiveCount');
const toggleArchive  = document.getElementById('toggleArchive');
const emptyArchiveBtn= document.getElementById('emptyArchive');

// auth elements
const authOverlay    = document.getElementById('auth');
const authPassword   = document.getElementById('authPassword');
const authSubmit     = document.getElementById('authSubmit');
const authError      = document.getElementById('authError');

// =============================
//  API helpers
// =============================
async function fetchTasks() {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      headers: apiHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    state = await res.json();
    render();
  } catch (err) {
    console.error(err);
  }
}

async function apiAddTask(title) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to add task');
  return res.json();
}

async function apiUpdateTask(id, patch) {
  const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

async function apiDeleteTask(id) {
  const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to delete task');
  }
}

async function apiClearDone() {
  const res = await fetch(`${API_BASE}/api/tasks?done=true`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to clear completed tasks');
  }
}

// =============================
//  Rendering: active list
// =============================
function render() {
  const items = state.filter((t) => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    return true;
  });

  emptyEl.style.display = items.length ? 'none' : 'block';
  listEl.innerHTML = '';

  for (const item of items) {
    listEl.appendChild(renderItem(item));
  }

  const left = state.filter((t) => !t.done).length;
  badgeEl.textContent = `${left} left`;

  for (const b of filterBtns) {
    b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  }

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
  del.addEventListener('click', async () => {
    if (!confirmDanger('Delete this task permanently?')) return;
    await remove(item.id);
  });

  actions.appendChild(del);
  li.appendChild(cb);
  li.appendChild(title);
  li.appendChild(actions);
  return li;
}

// =============================
//  Rendering: archive
// =============================
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function renderArchive() {
  if (!archiveSection) return;
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
    restoreBtn.addEventListener('click', async () => {
      if (!confirmDanger('Restore this task back to active list?')) return;
      await restoreFromArchive(t.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete Forever';
    deleteBtn.addEventListener('click', () => {
      if (!confirmDanger('Permanently delete this archived task?')) return;
      deleteForever(t.id);
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(left);
    li.appendChild(actions);
    archiveListEl.appendChild(li);
  }
}

// =============================
//  Mutations: active list
// =============================
async function add(title) {
  title = (title || '').trim();
  if (!title) return;
  try {
    const task = await apiAddTask(title);
    state.unshift(task);
    newTaskEl.value = '';
    render();
  } catch (err) {
    console.error(err);
  }
}

async function toggle(id) {
  const task = state.find((t) => t.id === id);
  if (!task) return;
  try {
    const updated = await apiUpdateTask(id, { done: !task.done });
    state = state.map((t) => (t.id === id ? updated : t));
    render();
  } catch (err) {
    console.error(err);
  }
}

async function remove(id) {
  try {
    await apiDeleteTask(id);
    state = state.filter((t) => t.id !== id);
    render();
  } catch (err) {
    console.error(err);
  }
}

async function clearDone() {
  const doneTasks = state.filter((t) => t.done);
  if (!doneTasks.length) return;

  const now = Date.now();
  // move to archive (local)
  archive = [
    ...doneTasks.map((t) => ({ ...t, archivedAt: now })),
    ...archive,
  ];
  saveArchive();

  try {
    await apiClearDone();
    state = state.filter((t) => !t.done);
    render();
  } catch (err) {
    console.error(err);
  }
}

async function startEdit(id, titleEl) {
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
    try {
      const updated = await apiUpdateTask(id, { title: newTitle });
      state = state.map((t) => (t.id === id ? updated : t));
      render();
    } catch (err) {
      console.error(err);
      render(); // fallback render
    }
  };
  const cancel = () => {
    render();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
}

// =============================
//  Mutations: archive
// =============================
async function restoreFromArchive(id) {
  const idx = archive.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const t = archive[idx];

  archive.splice(idx, 1);
  saveArchive();

  try {
    const created = await apiAddTask(t.title);
    state.unshift(created);
    render();
  } catch (err) {
    console.error(err);
  }
}

function deleteForever(id) {
  archive = archive.filter((t) => t.id !== id);
  saveArchive();
  if (archiveVisible) renderArchive();
}

// =============================
//  Auth: password gate
// =============================
function unlockApp() {
  document.body.classList.add('authed');
  localStorage.setItem('todo_authed', '1');
  fetchTasks();
}

function checkPassword() {
  const value = authPassword.value;
  if (value === APP_PASSWORD) {
    authError.textContent = '';
    unlockApp();
  } else {
    authError.textContent = 'Wrong password.';
    authPassword.select();
  }
}

// =============================
//  Event wiring
// =============================
addBtn.addEventListener('click', () => add(newTaskEl.value));
newTaskEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') add(newTaskEl.value);
});

clearDoneBtn.addEventListener('click', async () => {
  if (!confirmDanger('Move all completed tasks to Archive and clear them from active list?')) return;
  await clearDone();
});

for (const b of filterBtns) {
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    render();
  });
}

if (toggleArchive && archiveSection) {
  toggleArchive.addEventListener('click', () => {
    archiveVisible = !archiveVisible;
    archiveSection.hidden = !archiveVisible;
    toggleArchive.setAttribute('aria-pressed', String(archiveVisible));
    if (archiveVisible) renderArchive();
  });
}

if (emptyArchiveBtn) {
  emptyArchiveBtn.addEventListener('click', () => {
    if (!archive.length) return;
    if (!confirmDanger('Delete ALL archived tasks permanently?')) return;
    archive = [];
    saveArchive();
    renderArchive();
  });
}

// auth events
authSubmit.addEventListener('click', checkPassword);
authPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkPassword();
});

// =============================
//  Boot
// =============================
const alreadyAuthed = localStorage.getItem('todo_authed') === '1';

if (alreadyAuthed) {
  document.body.classList.add('authed');
  fetchTasks();
} else {
  document.body.classList.remove('authed');
}
