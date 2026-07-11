// Orbito — App Shell: routing, utilities, dashboard, settings

// ── Module Registry ──
const MODULES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  projects:  { title: 'Projects',  render: (c) => ProjectsModule.render(c) },
  parts:     { title: 'Parts & Inventory', render: (c) => PartsModule.render(c) },
  bom:       { title: 'Bill of Materials',  render: (c) => BomModule.render(c) },
  vendors:   { title: 'Vendors',   render: (c) => VendorsModule.render(c) },
  tools:     { title: 'Tools',     render: (c) => ToolsModule.render(c) },
  people:    { title: 'People',    render: (c) => PeopleModule.render(c) },
  tasks:     { title: 'Tasks',     render: (c) => TasksModule.render(c) },
  history:   { title: 'Activity',  render: (c) => HistoryModule.render(c) },
  workspace: { title: 'Workspace Map', render: (c) => WorkspaceModule.render(c) },
  spreadsheet: { title: 'Spreadsheet View', render: (c) => SpreadsheetModule.render(c) },
  sketches:  { title: 'Global Sketches', render: (c) => SketchesModule.render(c) },
  search:    { title: 'Find / Search', render: (c) => SearchModule.render(c) },
  settings:  { title: 'Settings',  render: renderSettings },
};

let currentView = 'dashboard';

// ── Navigation ──
async function navigate(view) {
  if (!MODULES[view]) view = 'dashboard';
  currentView = view;

  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Update topbar
  document.getElementById('topbarTitle').textContent = MODULES[view].title;
  document.getElementById('topbarActions').innerHTML = '';

  // Render
  const container = document.getElementById('pageContent');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px"></i></div>';

  try {
    await MODULES[view].render(container);
  } catch (err) {
    console.error('Render error:', err);
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Something went wrong</h3><p>${err.message}</p></div>`;
  }

  // Update hash
  if (location.hash !== '#' + view) {
    history.pushState(null, '', '#' + view);
  }
}

// ── Toast ──
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, 3500);
}

// ── Modal ──
function openModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── Photo Upload Helper ──
function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ── Format Helpers ──
function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStockChip(inStock, needed, partId) {
  const perc = needed ? (inStock / needed) * 100 : 0;
  const thresholds = window.__stockThresholds || { high: 80, medium: 50, low: 10 };
  let cls = 'stock-red';
  if (perc >= thresholds.high) cls = 'stock-full';
  else if (perc >= thresholds.medium) cls = 'stock-green';
  else if (perc >= thresholds.low) cls = 'stock-yellow';

  return `<span class="stock-chip ${cls}" data-part-id="${partId}" title="${inStock}/${needed}">${inStock}/${needed}</span>`;
}

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(2);
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Security / Encoding Helpers ──
function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// escapeAttr escapes a string for safe interpolation into an HTML attribute value
// (double-quoted). Use this for any ${dynamic} inside `onclick="…"`, `href="…"`,
// `src="…"`, etc., instead of plain escapeHTML.
function escapeAttr(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '&#96;');
}

// Centralized UUID helper. Falls back to Math.random when crypto.randomUUID
// isn't available (older browsers or insecure contexts).
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

// Expose uid/uid() on window so feature-module scripts can reach it without
// having to inline duplicate crypto.randomUUID fallbacks.
window.uid = uid;

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── Dashboard ──
async function renderDashboard(container) {
  const [projects, parts, tools, people, tasks, vendors, locations, sessions] = await Promise.all([
    DB.getAll('projects'),
    DB.getAll('parts'),
    DB.getAll('tools'),
    DB.getAll('users'),
    DB.getAll('tasks'),
    DB.getAll('vendors'),
    DB.getAll('locations'),
    // `sessions` was added in IndexedDB v2; swallow failure on legacy DBs.
    DB.getAll('sessions').catch(() => []),
  ]);

  const topProjects = projects.filter(p => !p.parentId);
  const todoTasks = tasks.filter(t => t.status === 'todo').length;
  const inProgressTasks = tasks.filter(t => t.status === 'inprogress').length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const totalInStock = parts.reduce((s, p) => s + (p.inStock || 0), 0);
  const totalNeeded = parts.reduce((s, p) => s + (p.needed || 0), 0);
  const checkedOut = tools.filter(t => t.checkedOutBy).length;

  // Recent sign-ins for the current user. Match strictly on userId so a user
  // with a non-unique display name (e.g. two "John Smith" students) does NOT
  // see each other's sessions.
  const myUid = AuthModule?.currentUser?.uid || AuthModule?.currentUser?.id;
  const recentSessions = (sessions || [])
    .filter(s => s.userId && myUid && s.userId === myUid)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 5);

  container.innerHTML = `
    <div class="grid-4 mb-4">
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--accent-dim);color:var(--accent)"><i class="fa-solid fa-folder-open"></i></div>
        <div class="stat-label">Projects</div>
        <div class="stat-value">${topProjects.length}</div>
        <div class="stat-sub">${projects.length - topProjects.length} sub-projects</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--blue-dim);color:var(--blue)"><i class="fa-solid fa-screwdriver-wrench"></i></div>
        <div class="stat-label">Parts</div>
        <div class="stat-value">${parts.length}</div>
        <div class="stat-sub">${totalInStock} in stock · ${totalNeeded} needed</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--green-dim);color:var(--green)"><i class="fa-solid fa-wrench"></i></div>
        <div class="stat-label">Tools</div>
        <div class="stat-value">${tools.length}</div>
        <div class="stat-sub">${checkedOut} checked out</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--purple-dim);color:var(--purple)"><i class="fa-solid fa-list-check"></i></div>
        <div class="stat-label">Tasks</div>
        <div class="stat-value">${tasks.length}</div>
        <div class="stat-sub">${todoTasks} to do · ${inProgressTasks} in progress · ${doneTasks} done</div>
      </div>
    </div>

    <div class="grid-3" style="margin-top:20px">
      <!-- Recent tasks -->
      <div class="card">
        <div class="card-header"><h3>Recent Tasks</h3></div>
        <div class="card-body" style="padding:0">
          ${tasks.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No tasks yet</p></div>' :
            tasks.sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0)).slice(0,5).map(t => `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:13px;font-weight:500">${escapeHTML(t.title)}</div>
                  <div style="font-size:11px;color:var(--text-3);margin-top:2px">${formatDate(t.updatedAt)}</div>
                </div>
                <span class="badge badge-${t.status==='done'?'green':t.status==='inprogress'?'amber':'gray'}">${t.status==='inprogress'?'In Progress':t.status==='done'?'Done':'To Do'}</span>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Team -->
      <div class="card">
        <div class="card-header"><h3>Team (${people.length})</h3></div>
        <div class="card-body" style="padding:0">
          ${people.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No team members yet</p></div>' :
            people.slice(0,6).map(p => `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
                <div class="avatar">${initials(p.name)}</div>
                <div>
                  <div style="font-size:13px;font-weight:500">${escapeHTML(p.name)}</div>
                  <div style="font-size:11px;color:var(--text-3)">${escapeHTML(p.role || 'Member')}</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Recent Sign-Ins -->
      <div class="card">
        <div class="card-header">
          <h3>Recent Sign-Ins</h3>
          <span class="badge badge-${AuthModule?.currentSession?.mode === 'online' ? 'green' : 'amber'}" style="font-size:10px;margin-left:8px">
            ${AuthModule?.currentSession?.mode === 'online' ? 'Google' : 'Offline'}
          </span>
        </div>
        <div class="card-body" style="padding:0">
          ${recentSessions.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No session history</p></div>' :
            recentSessions.map(s => `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="font-size:13px;font-weight:500"><i class="fa-solid ${s.mode === 'online' ? 'fa-cloud' : 'fa-wifi'}" style="margin-right:6px;color:${s.mode === 'online' ? 'var(--green)' : 'var(--amber)'}" ></i>${escapeHTML(s.mode)}</div>
                  <div style="font-size:11px;color:var(--text-3)">${HistoryModule?.timeAgo ? HistoryModule.timeAgo(s.startedAt) : formatDate(s.startedAt)}</div>
                </div>
                <div style="font-size:11px;color:var(--text-3);margin-top:4px">${escapeHTML(s.platform || '')}</div>
                ${s.endedAt ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px"><i class="fa-solid fa-arrow-right-from-bracket" style="margin-right:4px"></i>Ended ${HistoryModule?.timeAgo ? HistoryModule.timeAgo(s.endedAt) : formatDate(s.endedAt)}</div>` : '<div style="font-size:11px;color:var(--green);margin-top:2px"><i class="fa-solid fa-circle" style="margin-right:4px"></i>Active</div>'}
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3>Quick Stats</h3></div>
      <div class="card-body">
        <div class="grid-3">
          <div><span style="color:var(--text-3);font-size:12px">Vendors</span><div style="font-size:20px;font-weight:600;margin-top:2px">${vendors.length}</div></div>
          <div><span style="color:var(--text-3);font-size:12px">Locations</span><div style="font-size:20px;font-weight:600;margin-top:2px">${locations.length}</div></div>
          <div><span style="color:var(--text-3);font-size:12px">People</span><div style="font-size:20px;font-weight:600;margin-top:2px">${people.length}</div></div>
        </div>
      </div>
    </div>
  `;
}

async function renderSettings(container) {
  const user = AuthModule.currentUser;

  container.innerHTML = `
    <div style="max-width:600px">
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Account</h3></div>
        <div class="card-body">
          <div class="flex items-center gap-3" style="margin-bottom:16px">
            <div class="avatar" style="width:40px;height:40px;font-size:16px">${initials(user?.name)}</div>
            <div>
              <div style="font-weight:500">${escapeHTML(user?.name)}</div>
              <div class="text-sm text-muted">${escapeHTML(user?.email)} &bull; ${escapeHTML(user?.role)}</div>
              <div class="text-xs text-muted" style="margin-top:6px">
                <i class="fa-solid fa-clock" style="margin-right:4px"></i>
                Last sign-in: ${
                  window.AuthModule?.currentSession?.startedAt
                    ? (HistoryModule?.timeAgo ? HistoryModule.timeAgo(window.AuthModule.currentSession.startedAt) : formatDate(window.AuthModule.currentSession.startedAt))
                    : '—'
                }
              </div>
              <div class="text-xs text-muted" style="margin-top:2px">
                <i class="fa-solid fa-display" style="margin-right:4px"></i>
                This device: ${escapeHTML(window.AuthModule?.currentSession?.platform || '—')}
              </div>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="AuthModule.signOut()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Appearance</h3></div>
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <div style="font-weight:500">Theme Preference</div>
              <div class="text-sm text-muted">Switch between Light and Dark mode.</div>
            </div>
            <select class="form-select" id="themeSelect" style="width:120px">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="dracula">Dracula</option>
              <option value="oled">OLED Black</option>
              <option value="solarized">Solarized</option>
              <option value="cyberpunk">Cyberpunk</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Stock Thresholds</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Customize percentage thresholds for inventory level colors.</p>
          <div class="grid-3" style="gap:12px; margin-bottom:16px">
            <div>
              <label class="form-label">Full (>= %)</label>
              <input type="number" class="form-input" id="thresholdHigh" value="${window.__stockThresholds?.high ?? 80}" min="0" max="100">
            </div>
            <div>
              <label class="form-label">Medium (>= %)</label>
              <input type="number" class="form-input" id="thresholdMedium" value="${window.__stockThresholds?.medium ?? 50}" min="0" max="100">
            </div>
            <div>
              <label class="form-label">Low (>= %)</label>
              <input type="number" class="form-input" id="thresholdLow" value="${window.__stockThresholds?.low ?? 10}" min="0" max="100">
            </div>
          </div>
          <button class="btn btn-primary" id="saveThresholdsBtn"><i class="fa-solid fa-floppy-disk"></i> Save Thresholds</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Export Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Download all your Orbito data as a JSON file. Backups include people names, emails, and contact info by default &mdash; uncheck the box below to strip PII before exporting for sharing.</p>
          <div style="margin-bottom:12px">
            <label class="flex items-center gap-2" style="cursor:pointer">
              <input type="checkbox" id="exportIncludePII" checked style="accent-color:var(--accent)">
              <span class="text-sm">Include email and contact info (PII)</span>
            </label>
            <label class="flex items-center gap-2" style="cursor:pointer;margin-top:6px">
              <input type="checkbox" id="exportAcknowledged" style="accent-color:var(--accent)">
              <span class="text-sm">I understand this backup may contain personally identifiable information.</span>
            </label>
          </div>
          <button class="btn btn-primary" id="exportBtn"><i class="fa-solid fa-download"></i> Export JSON</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Import Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Import data from a previously exported JSON file. This will <strong>replace</strong> all existing data.</p>
          <label class="btn btn-secondary" style="cursor:pointer">
            <i class="fa-solid fa-upload"></i> Choose File
            <input type="file" accept=".json" id="importFile" style="display:none"/>
          </label>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3>Sample Data</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Load a realistic sample database (Robot project, vendors, parts). This will <strong>replace</strong> all existing data.</p>
          <button class="btn btn-secondary" id="loadSampleBtn"><i class="fa-solid fa-flask"></i> Load Sample Data</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Danger Zone</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Permanently delete all data from Orbito. This cannot be undone.</p>
          <button class="btn btn-danger" id="clearBtn"><i class="fa-solid fa-trash"></i> Clear All Data</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('themeSelect').value = document.documentElement.getAttribute('data-theme') || 'dark';
  document.getElementById('themeSelect').addEventListener('change', (e) => {
    const t = e.target.value;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('orbito-theme', t);
  });

  document.getElementById('saveThresholdsBtn').addEventListener('click', async () => {
    const high = parseInt(document.getElementById('thresholdHigh').value) || 80;
    const medium = parseInt(document.getElementById('thresholdMedium').value) || 50;
    const low = parseInt(document.getElementById('thresholdLow').value) || 10;
    if (high < medium || medium < low) {
      return toast('Thresholds must be: Full >= Medium >= Low', 'error');
    }
    try {
      await DB.put('settings', { id: 'stockThresholds', high, medium, low });
      window.__stockThresholds = { high, medium, low };
      toast('Stock thresholds saved!', 'success');
    } catch (e) {
      toast('Failed to save thresholds: ' + e.message, 'error');
    }
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const includePII = document.getElementById('exportIncludePII').checked;
    const acknowledged = document.getElementById('exportAcknowledged').checked;

    // If PII is included, force an explicit acknowledgement so users understand
    // that the resulting JSON contains emails and contact info for the team.
    if (includePII && !acknowledged) {
      return toast('Please tick the acknowledgement box before exporting PII.', 'error');
    }

    const data = await DB.exportAll({ excludePII: !includePII });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `orbito-backup-${includePII ? 'full' : 'no-pii'}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(includePII ? 'Data exported (with PII).' : 'Data exported (PII excluded).', 'success');
  });

  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (confirm('This will REPLACE all existing data. Continue?')) {
        await DB.importAll(data);
        toast('Data imported!', 'success');
        navigate('dashboard');
      }
    } catch (err) {
      toast('Invalid file: ' + err.message, 'error');
    }
  });

  document.getElementById('loadSampleBtn').addEventListener('click', async () => {
    if (confirm('This will REPLACE all existing data with sample data. Continue?')) {
      try {
        toast('Loading sample data...', 'info');
        const res = await fetch('sample_data.json');
        const data = await res.json();
        await DB.importAll(data);
        toast('Sample data loaded!', 'success');
        navigate('dashboard');
      } catch (err) {
        toast('Failed to load sample data: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to permanently delete all data from Orbito? This cannot be undone.')) {
      const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items'];
      for (const store of stores) {
        await DB.clearStore(store);
      }
      toast('All data cleared.', 'success');
      navigate('dashboard');
    }
  });
}

// ── Quick-Add Sketch modal (module scope so the inline onclick can find it) ──
async function showQuickAddSketchModal() {
  const parts = await DB.getAll('parts');
  if (parts.length === 0) {
    toast("Please add at least one part first.", "error");
    return;
  }
  const partOptions = parts.map(p => `<option value="${escapeAttr(p.id)}">${escapeHTML(p.name)}</option>`).join('');

  openModal('Quick Add Sketch', `
    <div style="display:flex; flex-direction:column; gap:12px; padding: 10px 0;">
      <div class="form-group">
        <label class="form-label">Select Part</label>
        <select class="form-select" id="quickSketchPartSelect">
          ${partOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sketch Canvas</label>
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;touch-action:none">
          <canvas id="quickSketchCanvas" width="400" height="300" style="display:block;width:100%;cursor:crosshair"></canvas>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-secondary" onclick="window.clearQuickSketch()">Clear</button>
    <button class="btn btn-primary" onclick="window.saveQuickSketch()">Save Sketch</button>
  `);

  setTimeout(() => {
    const canvas = document.getElementById('quickSketchCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    const start = (e) => { e.preventDefault(); drawing = true; const {x,y} = getPos(e); ctx.beginPath(); ctx.moveTo(x,y); };
    const move = (e) => { e.preventDefault(); if (!drawing) return; const {x,y} = getPos(e); ctx.lineTo(x,y); ctx.stroke(); };
    const stop = (e) => { if(e.cancelable) e.preventDefault(); drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);

    canvas.addEventListener('touchstart', start, {passive:false});
    canvas.addEventListener('touchmove', move, {passive:false});
    canvas.addEventListener('touchend', stop);

    window.clearQuickSketch = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    window.saveQuickSketch = async () => {
      const partId = document.getElementById('quickSketchPartSelect').value;
      const dataUrl = canvas.toDataURL('image/png');
      const partsList = await DB.getAll('parts');
      const p = partsList.find(x => x.id === partId);
      if (!p) return;
      p.drawings = p.drawings || [];
      p.drawings.push(dataUrl);
      await DB.put('parts', p);
      toast('Sketch saved to drawings!', 'success');
      if (window.HistoryModule) {
        HistoryModule.log('update', 'part', partId, p.name, 'Added quick sketch');
      }
      closeModal();
      if (currentView === 'sketches' && window.SketchesModule) {
        await SketchesModule.loadData();
        SketchesModule.renderView();
      } else if (currentView === 'parts' && window.PartsModule) {
        await PartsModule.loadData();
        PartsModule.renderView();
      }
    };
  }, 100);
}
window.showQuickAddSketchModal = showQuickAddSketchModal;

// ── App Object ──
window.App = {
  async init() {
    // Theme init
    const savedTheme = localStorage.getItem('orbito-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Load stock thresholds
    try {
      const settingsList = await DB.getAll('settings');
      const thresholds = settingsList.find(s => s.id === 'stockThresholds');
      if (thresholds) {
        window.__stockThresholds = {
          high: thresholds.high ?? 80,
          medium: thresholds.medium ?? 50,
          low: thresholds.low ?? 10
        };
      } else {
        window.__stockThresholds = { high: 80, medium: 50, low: 10 };
      }
    } catch (e) {
      console.error("Failed to load stock thresholds:", e);
      window.__stockThresholds = { high: 80, medium: 50, low: 10 };
    }

    // Event delegation for stock chips quick edit
    document.body.addEventListener('click', async (e) => {
      const chip = e.target.closest('.stock-chip');
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        const partId = chip.dataset.partId;
        if (partId) {
          try {
            const partsList = await DB.getAll('parts');
            const part = partsList.find(p => p.id === partId);
            if (!part) return;

            openModal('Quick Edit Stock', `
              <div style="display:flex; flex-direction:column; gap:12px; padding: 10px 0;">
                <div>
                  <label class="form-label">In Stock</label>
                  <input type="number" id="quickInStock" class="form-input" value="${part.inStock || 0}" min="0">
                </div>
                <div>
                  <label class="form-label">Needed</label>
                  <input type="number" id="quickNeeded" class="form-input" value="${part.needed || 0}" min="0">
                </div>
              </div>
            `, `
              <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
              <button class="btn btn-primary" id="saveQuickStockBtn">Save</button>
            `);

            document.getElementById('saveQuickStockBtn').addEventListener('click', async () => {
              const inStock = parseInt(document.getElementById('quickInStock').value) || 0;
              const needed = parseInt(document.getElementById('quickNeeded').value) || 0;

              part.inStock = inStock;
              part.needed = needed;
              await DB.put('parts', part);
              toast('Stock updated!', 'success');
              if (window.HistoryModule) {
                HistoryModule.log('update', 'part', partId, part.name, `Stock: ${inStock}/${needed}`);
              }
              closeModal();

              // Refresh active view
              if (currentView === 'parts' && window.PartsModule) {
                await PartsModule.loadData();
                PartsModule.renderView();
              } else if (currentView === 'spreadsheet' && window.SpreadsheetModule) {
                await SpreadsheetModule.loadData();
                SpreadsheetModule.renderRows();
              } else if (currentView === 'bom' && window.BomModule) {
                await BomModule.loadData();
                if (document.getElementById('bomProjectSelect')) {
                  const selVal = document.getElementById('bomProjectSelect').value;
                  if (selVal) BomModule.renderBomForProject(selVal);
                }
              } else if (currentView === 'dashboard') {
                navigate('dashboard');
              }
            });
          } catch (err) {
            console.error("Error loading part for quick edit:", err);
          }
        }
      }
    });

    // Sidebar nav clicks
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.view);
      });
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Mobile sidebar toggle
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function toggleSidebar(force) {
      const isOpen = sidebar.classList.toggle('open', force);
      if (sidebarOverlay) sidebarOverlay.classList.toggle('show', isOpen);
    }

    if (window.innerWidth <= 768) toggle.style.display = '';
    toggle.addEventListener('click', () => toggleSidebar());

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Swipe to close
    let touchStartX = 0;
    let touchEndX = 0;
    document.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    document.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        // Swipe left
        if (touchStartX - touchEndX > 50) {
          toggleSidebar(false);
        }
      }
    }, {passive: true});

    window.addEventListener('resize', () => {
      toggle.style.display = window.innerWidth <= 768 ? '' : 'none';
      if (window.innerWidth > 768) toggleSidebar(false);
    });

    // Auto close sidebar on nav for mobile
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', () => {
        if (window.innerWidth <= 768) toggleSidebar(false);
      });
    });

    // Hash routing
    const hash = location.hash.slice(1) || 'dashboard';
    navigate(hash);

    window.addEventListener('popstate', () => {
      navigate(location.hash.slice(1) || 'dashboard');
    });

    // Global FAB
    const fab = document.getElementById('globalFab');
    fab.style.display = '';
    fab.addEventListener('click', () => {
      openModal('Quick Add', `
        <div class="grid-4" style="text-align:center">
          <button class="btn btn-secondary flex items-center justify-center" style="flex-direction:column;padding:20px;gap:10px;height:auto" onclick="closeModal();navigate('parts').then(()=>document.getElementById('addPartBtn').click())">
            <i class="fa-solid fa-screwdriver-wrench fa-2x text-blue" style="width:auto"></i>
            <span>Part</span>
          </button>
          <button class="btn btn-secondary flex items-center justify-center" style="flex-direction:column;padding:20px;gap:10px;height:auto" onclick="closeModal();navigate('tasks').then(()=>document.getElementById('addTaskBtn').click())">
            <i class="fa-solid fa-list-check fa-2x text-purple" style="width:auto"></i>
            <span>Task</span>
          </button>
          <button class="btn btn-secondary flex items-center justify-center" style="flex-direction:column;padding:20px;gap:10px;height:auto" onclick="closeModal();navigate('projects').then(()=>document.getElementById('addProjectBtn').click())">
            <i class="fa-solid fa-folder-plus fa-2x text-accent" style="width:auto"></i>
            <span>Project</span>
          </button>
          <button class="btn btn-secondary flex items-center justify-center" style="flex-direction:column;padding:20px;gap:10px;height:auto" onclick="closeModal();window.showQuickAddSketchModal()">
            <i class="fa-solid fa-pen-nib fa-2x text-rose" style="width:auto"></i>
            <span>Sketch</span>
          </button>
        </div>
      `, '');
    });

    // Command Palette (Cmd+K)
    const cmdOverlay = document.getElementById('cmdOverlay');
    const cmdInput = document.getElementById('cmdInput');
    const cmdResults = document.getElementById('cmdResults');

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        cmdOverlay.classList.add('open');
        cmdInput.value = '';
        cmdResults.innerHTML = '';
        setTimeout(() => cmdInput.focus(), 50);
      }
      if (e.key === 'Escape' && cmdOverlay.classList.contains('open')) {
        cmdOverlay.classList.remove('open');
      }
    });

    cmdOverlay.addEventListener('click', (e) => {
      if (e.target === cmdOverlay) cmdOverlay.classList.remove('open');
    });

    cmdInput.addEventListener('input', async (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) { cmdResults.innerHTML = ''; return; }

      const [parts, projects, people, tasks] = await Promise.all([
        DB.getAll('parts'), DB.getAll('projects'), DB.getAll('users'), DB.getAll('tasks')
      ]);

      const results = [];
      parts.filter(p => p.name.toLowerCase().includes(q)).forEach(p => results.push({ type: 'Part', icon: 'fa-screwdriver-wrench', name: p.name, action: () => { navigate('parts').then(()=>PartsModule.showAddModal(p.id)); } }));
      projects.filter(p => p.name.toLowerCase().includes(q)).forEach(p => results.push({ type: 'Project', icon: 'fa-folder', name: p.name, action: () => { navigate('projects').then(()=>ProjectsModule.showDetail(p.id)); } }));
      people.filter(p => p.name.toLowerCase().includes(q)).forEach(p => results.push({ type: 'Person', icon: 'fa-user', name: p.name, action: () => { navigate('people').then(()=>PeopleModule.showDetail(p.id)); } }));
      tasks.filter(t => t.title.toLowerCase().includes(q)).forEach(t => results.push({ type: 'Task', icon: 'fa-check', name: t.title, action: () => { navigate('tasks').then(()=>TasksModule.showAddModal(t.id)); } }));

      if (results.length === 0) {
        cmdResults.innerHTML = '<div class="text-muted text-center" style="padding:20px">No results found</div>';
      } else {
        cmdResults.innerHTML = results.slice(0, 10).map((r, i) => `
          <div class="cmd-item" tabindex="0" onclick="window.cmdAction(${i})">
            <i class="fa-solid ${escapeAttr(r.icon)}"></i>
            <div>
              <div style="font-size:14px;font-weight:500">${escapeHTML(r.name)}</div>
              <div style="font-size:11px;color:var(--text-3)">${escapeHTML(r.type)}</div>
            </div>
          </div>
        `).join('');

        window.cmdAction = (i) => {
          cmdOverlay.classList.remove('open');
          results[i].action();
        };
      }
    });

    // Secret Easter Egg
    document.addEventListener('keydown', (e) => {
      // Cmd + Shift + Option + K
      if (e.metaKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const cat = document.createElement('img');
        cat.src = 'https://cataas.com/cat/gif';
        cat.style.position = 'fixed';
        cat.style.top = '-200px';
        cat.style.right = '50px';
        cat.style.width = '150px';
        cat.style.zIndex = '999999';
        cat.style.transition = 'top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.5s ease-in-out';
        cat.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
        cat.style.borderRadius = '12px';
        cat.style.transform = 'rotate(15deg)';
        document.body.appendChild(cat);

        setTimeout(() => { cat.style.top = '20px'; }, 100);

        // Remove after a bit
        setTimeout(() => {
          cat.style.top = '-200px';
          cat.style.transform = 'rotate(-15deg)';
          setTimeout(() => cat.remove(), 500);
        }, 3000);
      }
    });
  }
};
