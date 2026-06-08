// tasks.js
const TasksModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.tasks = await DB.getAll('tasks');
    this.people = await DB.getAll('users');
    this.projects = await DB.getAll('projects');
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" id="taskAssigneeFilter" style="width:150px">
            <option value="all">All Assignees</option>
            ${this.people.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
          </select>
          <select class="form-select" id="taskProjectFilter" style="width:150px">
            <option value="all">All Projects</option>
            ${this.projects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" id="addTaskBtn"><i class="fa-solid fa-plus"></i> Add Task</button>
        </div>
      </div>
      <div id="kanbanBoard" class="kanban"></div>
    `;

    document.getElementById('addTaskBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('taskAssigneeFilter').addEventListener('change', () => this.renderBoard());
    document.getElementById('taskProjectFilter').addEventListener('change', () => this.renderBoard());

    this.renderBoard();
  },

  renderBoard() {
    const assigneeFilter = document.getElementById('taskAssigneeFilter').value;
    const projectFilter = document.getElementById('taskProjectFilter').value;

    let filtered = this.tasks;
    if (assigneeFilter !== 'all') filtered = filtered.filter(t => t.assigneeId === assigneeFilter);
    if (projectFilter !== 'all') filtered = filtered.filter(t => t.projectId === projectFilter);

    const cols = {
      'todo': { title: 'To Do', items: [] },
      'inprogress': { title: 'In Progress', items: [] },
      'done': { title: 'Done', items: [] }
    };

    filtered.forEach(t => {
      if (cols[t.status]) cols[t.status].items.push(t);
      else cols['todo'].items.push(t);
    });

    const board = document.getElementById('kanbanBoard');
    board.innerHTML = Object.entries(cols).map(([status, col]) => `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <span>${col.title}</span>
          <span class="badge badge-gray">${col.items.length}</span>
        </div>
        <div class="kanban-col-body">
          ${col.items.map(t => {
            const p = this.people.find(x => x.id === t.assigneeId);
            const proj = this.projects.find(x => x.id === t.projectId);
            return `
              <div class="kanban-card" onclick="TasksModule.showEditModal('${t.id}')">
                <div class="flex items-start justify-between gap-2">
                  <div class="kanban-card-title">${escapeHTML(t.title)}</div>
                  <span class="priority-dot priority-${t.priority || 'medium'}" title="Priority: ${t.priority || 'medium'}"></span>
                </div>
                ${proj ? `<div class="kanban-card-meta"><i class="fa-solid fa-folder"></i> ${escapeHTML(proj.name)}</div>` : ''}
                <div class="kanban-card-meta mt-2 flex justify-between items-center">
                  <span class="truncate" style="max-width:120px"><i class="fa-solid fa-user"></i> ${p ? escapeHTML(p.name) : 'Unassigned'}</span>
                  ${t.dueDate ? `<span><i class="fa-regular fa-calendar"></i> ${formatDate(t.dueDate)}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  },

  async showAddModal(id = null) {
    const t = id ? this.tasks.find(x => x.id === id) : { priority: 'medium', status: 'todo' };
    
    const pOpts = this.people.map(p => `<option value="${p.id}" ${p.id === t.assigneeId ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('');
    const projOpts = this.projects.map(p => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('');

    const body = `
      <form id="taskForm">
        <div class="form-group">
          <label class="form-label">Task Title</label>
          <input type="text" class="form-input" id="taskTitle" value="${escapeHTML(t.title || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="taskDesc">${escapeHTML(t.description || '')}</textarea>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Assignee</label>
            <select class="form-select" id="taskAssignee"><option value="">Unassigned</option>${pOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Project</label>
            <select class="form-select" id="taskProject"><option value="">No Project</option>${projOpts}</select>
          </div>
        </div>
        <div class="grid-3">
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-select" id="taskPriority">
              <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${t.priority === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="taskStatus">
              <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
              <option value="inprogress" ${t.status === 'inprogress' ? 'selected' : ''}>In Progress</option>
              <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" class="form-input" id="taskDueDate" value="${t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : ''}">
          </div>
        </div>
      </form>
    `;
    const footer = `
      ${id ? `<button class="btn btn-danger" style="margin-right:auto" onclick="TasksModule.deleteTask('${id}')">Delete</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="TasksModule.saveTask('${id || ''}', this)">Save Task</button>
    `;
    openModal(id ? 'Edit Task' : 'Add Task', body, footer);
  },

  async showEditModal(id) {
    this.showAddModal(id);
  },

  async saveTask(id, btn) {
    if (btn) btn.disabled = true;
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) {
      if (btn) btn.disabled = false;
      return toast('Title is required', 'error');
    }

    const dd = document.getElementById('taskDueDate').value;

    const data = {
      id: id || undefined,
      title,
      description: document.getElementById('taskDesc').value.trim(),
      assigneeId: document.getElementById('taskAssignee').value || null,
      projectId: document.getElementById('taskProject').value || null,
      priority: document.getElementById('taskPriority').value,
      status: document.getElementById('taskStatus').value,
      dueDate: dd ? new Date(dd).getTime() : null
    };

    try {
      if (id) {
        await DB.put('tasks', data);
        toast('Task updated', 'success');
        HistoryModule.log('update', 'task', id, data.title);
      } else {
        const newId = await DB.add('tasks', data);
        toast('Task added', 'success');
        HistoryModule.log('create', 'task', newId, data.title);
      }
      
      closeModal();
      await this.loadData();
      this.renderBoard();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving task', 'error');
    }
  },

  async deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    const task = this.tasks.find(t => t.id === id);
    await DB.delete('tasks', id);
    HistoryModule.log('delete', 'task', id, task?.title || '');
    toast('Task deleted', 'success');
    closeModal();
    await this.loadData();
    this.renderBoard();
  }
};
