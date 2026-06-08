// tools.js
const ToolsModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.tools = await DB.getAll('tools');
    this.people = await DB.getAll('users');
    this.locations = await DB.getAll('locations');
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="toolsSearch" placeholder="Search tools...">
          </div>
          <select class="form-select" style="width:150px" id="toolsFilter">
            <option value="all">All Tools</option>
            <option value="available">Available</option>
            <option value="checkedout">Checked Out</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" id="addToolBtn"><i class="fa-solid fa-plus"></i> Add Tool</button>
        </div>
      </div>
      <div id="toolsGrid" class="grid-auto"></div>
    `;

    document.getElementById('addToolBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('toolsSearch').addEventListener('input', debounce(() => this.renderGrid(), 250));
    document.getElementById('toolsFilter').addEventListener('change', () => this.renderGrid());

    this.renderGrid();
  },

  renderGrid() {
    const grid = document.getElementById('toolsGrid');
    const q = document.getElementById('toolsSearch').value.toLowerCase();
    const filter = document.getElementById('toolsFilter').value;

    let filtered = this.tools.filter(t => t.name.toLowerCase().includes(q));
    if (filter === 'available') filtered = filtered.filter(t => !t.checkedOutBy);
    if (filter === 'checkedout') filtered = filtered.filter(t => !!t.checkedOutBy);

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-wrench"></i><h3>No tools found</h3><p>Add tools to your inventory.</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(t => {
      const loc = this.locations.find(l => l.id === t.locationId);
      const person = this.people.find(p => p.id === t.checkedOutBy);
      
      const condColors = { 'good': 'green', 'maintenance': 'amber', 'broken': 'red' };
      const condLabels = { 'good': 'Good', 'maintenance': 'Needs Maint.', 'broken': 'Broken' };
      
      return `
        <div class="card">
          <div style="height:120px;background:var(--bg-3);border-radius:var(--radius-lg) var(--radius-lg) 0 0;overflow:hidden;position:relative">
            ${t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover">` : '<div class="flex items-center justify-center h-full text-muted"><i class="fa-solid fa-wrench fa-2x"></i></div>'}
            <div style="position:absolute;top:10px;right:10px">
              <span class="badge badge-${condColors[t.condition] || 'gray'}">${condLabels[t.condition] || 'Good'}</span>
            </div>
          </div>
          <div class="card-body">
            <h3 style="font-size:15px;font-weight:600" class="truncate">${escapeHTML(t.name)}</h3>
            <div class="text-xs text-muted mt-2 truncate"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(loc ? loc.name : 'No location')}</div>
            
            <div class="mt-4 pt-4" style="border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
              ${person 
                ? `<div class="flex items-center gap-2"><div class="avatar" style="width:24px;height:24px;font-size:10px">${initials(person.name)}</div><span class="text-xs font-medium text-accent">Checked out</span></div>
                   <button class="btn btn-secondary btn-sm" onclick="ToolsModule.checkIn('${t.id}')">Return</button>`
                : `<span class="badge badge-green">Available</span>
                   <button class="btn btn-primary btn-sm" onclick="ToolsModule.showCheckOutModal('${t.id}')">Check Out</button>`
              }
            </div>
            <div class="mt-3 text-right">
              <button class="btn-icon btn-sm" onclick="ToolsModule.showAddModal('${t.id}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn-icon btn-sm text-red" style="color:var(--red)" onclick="ToolsModule.deleteTool('${t.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(id = null) {
    const t = id ? this.tools.find(x => x.id === id) : {};
    const locOpts = this.locations.map(l => `<option value="${l.id}" ${l.id === t.locationId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('');

    const body = `
      <form id="toolForm">
        <div class="flex gap-4">
          <div style="width:120px">
            <label class="photo-upload" id="toolPhotoUpload">
              ${t.photo ? `<img src="${t.photo}">` : '<i class="fa-solid fa-camera"></i><span>Photo</span>'}
              <input type="file" accept="image/*" id="toolPhotoInput">
            </label>
          </div>
          <div style="flex:1">
            <div class="form-group">
              <label class="form-label">Tool Name</label>
              <input type="text" class="form-input" id="toolName" value="${escapeHTML(t.name || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Condition</label>
              <select class="form-select" id="toolCondition">
                <option value="good" ${t.condition === 'good' ? 'selected' : ''}>Good</option>
                <option value="maintenance" ${t.condition === 'maintenance' ? 'selected' : ''}>Needs Maintenance</option>
                <option value="broken" ${t.condition === 'broken' ? 'selected' : ''}>Broken</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Location</label>
          <select class="form-select" id="toolLocation"><option value="">None</option>${locOpts}</select>
        </div>
      </form>
    `;
    
    let currentPhoto = t.photo || null;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveToolBtn">Save Tool</button>
    `;
    openModal(id ? 'Edit Tool' : 'Add Tool', body, footer);

    document.getElementById('toolPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        currentPhoto = await readFileAsDataURL(file);
        document.getElementById('toolPhotoUpload').innerHTML = `<img src="${currentPhoto}"><input type="file" accept="image/*" id="toolPhotoInput">`;
      }
    });

    document.getElementById('saveToolBtn').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      btn.disabled = true;

      const name = document.getElementById('toolName').value.trim();
      if (!name) {
        btn.disabled = false;
        return toast('Name is required', 'error');
      }

      const data = {
        id: t.id,
        name,
        condition: document.getElementById('toolCondition').value,
        locationId: document.getElementById('toolLocation').value || null,
        photo: currentPhoto,
        checkedOutBy: t.checkedOutBy || null,
        checkedOutAt: t.checkedOutAt || null
      };

      try {
        if (id) {
          await DB.put('tools', data);
          HistoryModule.log('update', 'tool', id, data.name);
          toast('Tool updated', 'success');
        } else {
          const newId = await DB.add('tools', data);
          HistoryModule.log('create', 'tool', newId || data.id || 'new', data.name);
          toast('Tool added', 'success');
        }
        
        closeModal();
        await this.loadData();
        this.renderView();
      } catch (err) {
        btn.disabled = false;
        toast('Error saving tool', 'error');
      }
    });
  },

  async showCheckOutModal(id) {
    const t = this.tools.find(x => x.id === id);
    const peopleOpts = this.people.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');

    const body = `
      <div class="form-group">
        <label class="form-label">Check out ${escapeHTML(t.name)} to:</label>
        <select class="form-select" id="checkoutPerson">${peopleOpts}</select>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ToolsModule.saveCheckOut('${id}')">Check Out</button>
    `;
    openModal('Check Out Tool', body, footer);
  },

  async saveCheckOut(id) {
    const t = this.tools.find(x => x.id === id);
    const pid = document.getElementById('checkoutPerson').value;
    if (!pid) return toast('Select a person', 'error');

    t.checkedOutBy = pid;
    await DB.put('tools', t);
    const person = this.people.find(p => p.id === pid);
    const personName = person ? person.name : 'Unknown';
    HistoryModule.log('checkout', 'tool', id, t.name, 'Checked out to ' + personName);
    toast('Tool checked out', 'success');
    closeModal();
    await this.loadData();
    this.renderGrid();
  },

  async checkIn(id) {
    const t = this.tools.find(x => x.id === id);
    t.checkedOutBy = null;
    await DB.put('tools', t);
    HistoryModule.log('checkin', 'tool', id, t.name, 'Returned');
    toast('Tool returned', 'success');
    await this.loadData();
    this.renderGrid();
  },

  async deleteTool(id) {
    if (!confirm('Delete this tool?')) return;
    const t = this.tools.find(x => x.id === id);
    await DB.delete('tools', id);
    if (t) HistoryModule.log('delete', 'tool', id, t.name);
    toast('Tool deleted', 'success');
    await this.loadData();
    this.renderGrid();
  }
};
