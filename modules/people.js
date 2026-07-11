// people.js
const PeopleModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading team members...</p></div>`;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.people = await DB.getAll('users');
    this.tasks = await DB.getAll('tasks');
    this.tools = await DB.getAll('tools');
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="peopleSearch" placeholder="Search people...">
          </div>
          <select class="form-select" style="width:150px" id="peopleFilter">
            <option value="all">All Roles</option>
            <option value="Student">Student</option>
            <option value="Lead">Lead</option>
            <option value="Mentor">Mentor</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" id="addPersonBtn"><i class="fa-solid fa-plus"></i> Add Person</button>
        </div>
      </div>
      <div id="peopleGrid" class="grid-auto"></div>
    `;

    document.getElementById('addPersonBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('peopleSearch').addEventListener('input', debounce(() => this.renderGrid(), 250));
    document.getElementById('peopleFilter').addEventListener('change', () => this.renderGrid());

    this.renderGrid();
  },

  renderGrid() {
    const grid = document.getElementById('peopleGrid');
    const q = document.getElementById('peopleSearch').value.toLowerCase();
    const filter = document.getElementById('peopleFilter').value;

    let filtered = this.people.filter(p => p.name.toLowerCase().includes(q));
    if (filter !== 'all') filtered = filtered.filter(p => p.role === filter);

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-users"></i><h3>No team members found</h3><p>Add people to assign them tasks and tools.</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const pTasks = this.tasks.filter(t => t.assigneeId === p.id && t.status !== 'done');
      const pTools = this.tools.filter(t => t.checkedOutBy === p.id);
      const roleColors = { 'Mentor': 'amber', 'Lead': 'blue', 'Student': 'gray', 'Member': 'gray' };
      const isPending = p.status === 'pending';
      const isMentor = AuthModule && AuthModule.canPerform('approve_users');

      return `
        <div class="card" style="cursor:pointer; position:relative;" onclick="PeopleModule.showDetail('${p.id}')">
          ${isPending ? '<div style="position:absolute; top:12px; right:12px;"><span class="badge badge-amber">Pending</span></div>' : ''}
          <div class="card-body">
            <div class="flex items-center gap-3 mb-4">
              <div class="avatar" style="width:40px;height:40px;font-size:14px">${initials(p.name)}</div>
              <div>
                <h3 style="font-size:15px;font-weight:600">${escapeHTML(p.name)}</h3>
                <span class="badge badge-${roleColors[p.role] || 'gray'} mt-1">${escapeHTML(p.role || 'Member')}</span>
              </div>
            </div>
            <div class="text-xs text-muted mb-4 truncate"><i class="fa-solid fa-address-card"></i> ${escapeHTML(p.contact || 'No contact info')}</div>
            <div class="flex items-center justify-between text-xs text-muted pt-3 border-t" style="border-top: 1px solid var(--border)">
              <span>${pTasks.length} active tasks</span>
              <span>${pTools.length} tools</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(id = null) {
    const p = id ? this.people.find(x => x.id === id) : {};
    
    const canApprove = AuthModule && AuthModule.canPerform('approve_users');
    const currentStatus = p.status || 'approved';
    const body = `
      <form id="personForm">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" class="form-input" id="personName" value="${escapeHTML(p.name || '')}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Role</label>
            <select class="form-select" id="personRole">
              <option value="Student" ${p.role === 'Student' || p.role === 'Member' ? 'selected' : ''}>Student</option>
              <option value="Lead" ${p.role === 'Lead' ? 'selected' : ''}>Lead</option>
              ${AuthModule && AuthModule.canPerform('edit_roles') ? `<option value="Mentor" ${p.role === 'Mentor' ? 'selected' : ''}>Mentor</option>` : ''}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            ${canApprove
              ? `<select class="form-select" id="personStatus">
                  <option value="approved" ${currentStatus !== 'pending' ? 'selected' : ''}>Active</option>
                  <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending Approval</option>
                </select>`
              : `<p class="text-sm" id="personStatusDisplay" data-status="${currentStatus}">${currentStatus === 'pending' ? 'Pending Approval' : 'Active'}</p>
                 <p class="text-xs text-muted" style="margin-top:4px">Only Mentors can change account status.</p>`
            }
          </div>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">Contact Info (Phone/Email)</label>
          <input type="text" class="form-input" id="personContact" value="${escapeHTML(p.contact || '')}">
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="PeopleModule.savePerson(this, '${id || ''}')">Save Person</button>
    `;
    openModal(id ? 'Edit Person' : 'Add Person', body, footer);
  },

  async savePerson(btn, id) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('personName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Name is required', 'error');
    }

    const canApprove = AuthModule && AuthModule.canPerform('approve_users');
    // Read the status from the DOM (savePerson is a module method, not a
    // closure inside showAddModal, so it cannot reach the local `p` variable).
    // The Mentor-only branch exposes a `<select id="personStatus">`; the
    // read-only branch exposes a `<p id="personStatusDisplay" data-status="…">`
    // whose data attribute holds the canonical status ('approved' | 'pending').
    let status = 'approved';
    if (canApprove) {
      const sel = document.getElementById('personStatus');
      if (sel) status = sel.value;
    } else {
      const ro = document.getElementById('personStatusDisplay');
      if (ro && ro.dataset.status) status = ro.dataset.status;
    }

    const data = {
      id: id || undefined,
      name,
      role: document.getElementById('personRole').value,
      status,
      contact: document.getElementById('personContact').value.trim()
    };      try {
        if (id) {
          await DB.put('users', data);
          toast('Person updated', 'success');
          HistoryModule.log('update', 'user', id, name);
        } else {
          await DB.add('users', data);
          toast('Person added', 'success');
          HistoryModule.log('create', 'user', data.id || '', name);
        }

        closeModal();
        await this.loadData();
        if (this.currentPerson && this.currentPerson.id === id) {
          this.showDetail(id);
        } else {
          this.renderView();
        }
      } catch (err) {
        if (btn) btn.disabled = false;
        toast('Error saving person', 'error');
      }
  },

  showDetail(id) {
    this.currentPerson = this.people.find(p => p.id === id);
    if (!this.currentPerson) return this.renderView();

    const p = this.currentPerson;
    const pTasks = this.tasks.filter(t => t.assigneeId === p.id);
    const pTools = this.tools.filter(t => t.checkedOutBy === p.id);
    const roleColors = { 'Mentor': 'amber', 'Lead': 'blue', 'Student': 'gray', 'Member': 'gray' };

    this.container.innerHTML = `
      <div class="mb-4">
        <button class="btn btn-ghost mb-4" onclick="PeopleModule.currentPerson=null; PeopleModule.renderView()"><i class="fa-solid fa-arrow-left"></i> Back to Team</button>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="avatar" style="width:56px;height:56px;font-size:20px">${initials(p.name)}</div>
            <div>
              <h2 style="font-size:24px;font-weight:700">${escapeHTML(p.name)}</h2>
              <span class="badge badge-${roleColors[p.role] || 'gray'} mt-1">${escapeHTML(p.role || 'Member')}</span>
            </div>
          </div>
          <div class="flex gap-2">
            ${p.status === 'pending' && AuthModule.canPerform('approve_users') ? `<button class="btn btn-primary" onclick="PeopleModule.approveUser('${p.id}')"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
            <button class="btn btn-secondary" onclick="PeopleModule.showAddModal('${p.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-danger" onclick="PeopleModule.deletePerson('${p.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>
      
      <div class="card p-4 mb-5">
        <div class="text-xs text-muted uppercase tracking-wider mb-2">Contact Info</div>
        <div>${escapeHTML(p.contact || 'No contact info provided')}</div>
      </div>

      <div class="grid-2">
        <div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">Assigned Tasks</h3>
          <div class="card">
            ${pTasks.length === 0 ? '<div class="p-4 text-muted text-sm text-center">No tasks assigned</div>' : pTasks.map(t => `
              <div class="p-3 border-b" style="border-bottom:1px solid var(--border)">
                <div class="flex justify-between">
                  <span class="font-medium text-sm">${escapeHTML(t.title)}</span>
                  <span class="badge badge-${t.status==='done'?'green':'gray'} text-xs">${t.status}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">Checked Out Tools</h3>
          <div class="card">
            ${pTools.length === 0 ? '<div class="p-4 text-muted text-sm text-center">No tools checked out</div>' : pTools.map(t => `
              <div class="p-3 border-b flex justify-between items-center" style="border-bottom:1px solid var(--border)">
                <span class="font-medium text-sm">${escapeHTML(t.name)}</span>
                <button class="btn-sm btn-secondary" onclick="PeopleModule.returnTool('${t.id}')">Return</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  async returnTool(toolId) {
    const t = this.tools.find(x => x.id === toolId);
    if (!t) return;
    t.checkedOutBy = null;
    await DB.put('tools', t);
    toast('Tool returned', 'success');
    await this.loadData();
    this.showDetail(this.currentPerson.id);
  },

  async deletePerson(id) {
    if (!confirm('Delete this person?')) return;
    
    // clear assignments
    for (const t of this.tasks.filter(x => x.assigneeId === id)) {
      t.assigneeId = null;
      await DB.put('tasks', t);
    }
    for (const t of this.tools.filter(x => x.checkedOutBy === id)) {
      t.checkedOutBy = null;
      await DB.put('tools', t);
    }

    await DB.delete('users', id);
    HistoryModule.log('delete', 'user', id, this.currentPerson?.name || '');
    toast('Person deleted', 'success');
    this.currentPerson = null;
    await this.loadData();
    this.renderView();
  },

  async approveUser(id) {
    if (!confirm('Approve this user? They will be granted access to the team workspace.')) return;
    const user = this.people.find(p => p.id === id);
    if (!user) return;
    user.status = 'approved';
    await DB.put('users', user);
    HistoryModule.log('approve', 'user', id, user.name, 'User approved for access');
    toast('User approved!', 'success');
    await this.loadData();
    if (this.currentPerson && this.currentPerson.id === id) {
      this.showDetail(id);
    } else {
      this.renderView();
    }
  }
};
