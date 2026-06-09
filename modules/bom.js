// bom.js
const BomModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.projects = await DB.getAll('projects');
    this.parts = await DB.getAll('parts');
    this.boms = await DB.getAll('bom_items');
  },

  renderView() {
    const projOptions = this.projects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" id="bomProjectSelect" style="width:250px">
            <option value="">-- Select a Project --</option>
            ${projOptions}
          </select>
        </div>
        <div class="toolbar-right" id="bomActions" style="display:none">
          <button class="btn btn-secondary" id="exportBomBtn"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
          <button class="btn btn-secondary" id="importBomBtn"><i class="fa-solid fa-file-import"></i> Add All from Project</button>
          <button class="btn btn-primary" id="addBomItemBtn"><i class="fa-solid fa-plus"></i> Add Item</button>
        </div>
      </div>
      <div id="bomContent">
        <div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>Select a project</h3><p>Choose a project from the dropdown to view its BOM.</p></div>
      </div>
    `;

    document.getElementById('bomProjectSelect').addEventListener('change', (e) => this.renderBomForProject(e.target.value));
  },

  renderBomForProject(projectId) {
    if (!projectId) {
      document.getElementById('bomActions').style.display = 'none';
      document.getElementById('bomContent').innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>Select a project</h3><p>Choose a project from the dropdown to view its BOM.</p></div>';
      return;
    }

    document.getElementById('bomActions').style.display = '';
    document.getElementById('addBomItemBtn').onclick = () => this.showAddModal(projectId);
    document.getElementById('exportBomBtn').onclick = () => this.exportCSV(projectId);
    document.getElementById('importBomBtn').onclick = () => this.showImportAllFromProjectModal(projectId);

    const items = this.boms.filter(b => b.projectId === projectId);
    
    if (items.length === 0) {
      document.getElementById('bomContent').innerHTML = '<div class="empty-state"><p>This project has no BOM items yet.</p></div>';
      return;
    }

    let totalCost = 0;
    let completedCount = 0;

    const rows = items.map(b => {
      const part = this.parts.find(p => p.id === b.partId);
      const cost = part ? (part.unitCost || 0) * b.qtyNeeded : 0;
      totalCost += cost;
      if (b.status === 'installed') completedCount++;

      const statusMap = {
        'not_started': { label: 'Not Started', class: 'gray' },
        'ordered': { label: 'Ordered', class: 'amber' },
        'in_stock': { label: 'In Stock', class: 'blue' },
        'installed': { label: 'Installed', class: 'green' }
      };
      const st = statusMap[b.status] || statusMap['not_started'];

      return `
        <tr>
          <td data-label="Part">${escapeHTML(part ? part.name : 'Unknown Part')}</td>
          <td data-label="Qty Needed" class="text-right">${b.qtyNeeded}</td>
          <td data-label="In Stock (Total)" class="text-right">${part ? (part.inStock || 0) : 0}</td>
          <td data-label="Status"><span class="badge badge-${st.class}">${st.label}</span></td>
          <td data-label="Unit Cost" class="text-right">${formatCurrency(part ? part.unitCost : 0)}</td>
          <td data-label="Line Total" class="text-right">${formatCurrency(cost)}</td>
          <td data-label="Actions" class="text-right">
            <button class="btn-icon btn-sm" onclick="BomModule.showEditModal('${b.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon btn-sm text-red" style="color:var(--red)" onclick="BomModule.deleteItem('${b.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    const pct = Math.round((completedCount / items.length) * 100);

    document.getElementById('bomContent').innerHTML = `
      <div class="grid-4 mb-4">
        <div class="card stat-card"><div class="stat-label">Total Items</div><div class="stat-value">${items.length}</div></div>
        <div class="card stat-card"><div class="stat-label">Total Cost</div><div class="stat-value">${formatCurrency(totalCost)}</div></div>
        <div class="card stat-card"><div class="stat-label">Installed</div><div class="stat-value">${completedCount}</div></div>
        <div class="card stat-card"><div class="stat-label">Progress</div><div class="stat-value">${pct}%</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th class="text-right">Qty Needed</th>
              <th class="text-right">In Stock (Total)</th>
              <th>Status</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-right">Line Total</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  async showAddModal(projectId) {
    const partOptions = this.parts.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    
    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <select class="form-select" id="bomPartSelect">${partOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity Needed</label>
        <input type="number" class="form-input" id="bomQty" value="1" min="1">
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.saveItem('${projectId}', this)">Add Item</button>
    `;
    openModal('Add BOM Item', body, footer);
  },

  async showEditModal(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    const part = this.parts.find(p => p.id === item.partId);

    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <input type="text" class="form-input" value="${escapeHTML(part ? part.name : 'Unknown')}" disabled>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="editBomQty" value="${item.qtyNeeded}" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="editBomStatus">
            <option value="not_started" ${item.status === 'not_started' ? 'selected' : ''}>Not Started</option>
            <option value="ordered" ${item.status === 'ordered' ? 'selected' : ''}>Ordered</option>
            <option value="in_stock" ${item.status === 'in_stock' ? 'selected' : ''}>In Stock</option>
            <option value="installed" ${item.status === 'installed' ? 'selected' : ''}>Installed</option>
          </select>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.updateItem('${id}', this)">Save Changes</button>
    `;
    openModal('Edit BOM Item', body, footer);
  },

  async saveItem(projectId, btn) {
    if (btn) btn.disabled = true;
    const partId = document.getElementById('bomPartSelect').value;
    const qtyNeeded = parseInt(document.getElementById('bomQty').value) || 1;
    if (!partId) {
      if (btn) btn.disabled = false;
      return toast('Please select a part', 'error');
    }

    try {
      const newId = await DB.add('bom_items', {
        projectId, partId, qtyNeeded, status: 'not_started'
      });
      const part = this.parts.find(p => p.id === partId);
      HistoryModule.log('create', 'bom_item', newId || 'new', part ? part.name : 'Unknown Part');
      
      toast('Item added to BOM', 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(projectId);
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving BOM item', 'error');
    }
  },

  async updateItem(id, btn) {
    if (btn) btn.disabled = true;
    const item = this.boms.find(b => b.id === id);
    item.qtyNeeded = parseInt(document.getElementById('editBomQty').value) || 1;
    item.status = document.getElementById('editBomStatus').value;
    
    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part ? part.name : 'Unknown Part', `Status: ${item.status}, Qty: ${item.qtyNeeded}`);
      toast('Item updated', 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(item.projectId);
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error updating item', 'error');
    }
  },

  async deleteItem(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item || !confirm('Remove item from BOM?')) return;
    
    await DB.delete('bom_items', id);
    const part = this.parts.find(p => p.id === item.partId);
    HistoryModule.log('delete', 'bom_item', id, part ? part.name : 'Unknown Part');
    toast('Item removed', 'success');
    await this.loadData();
    this.renderBomForProject(item.projectId);
  },

  exportCSV(projectId) {
    const items = this.boms.filter(b => b.projectId === projectId);
    const p = this.projects.find(x => x.id === projectId);
    
    let csv = 'Part Name,Qty Needed,In Stock,Status,Unit Cost,Line Total\n';
    items.forEach(b => {
      const part = this.parts.find(pt => pt.id === b.partId);
      const name = part ? `"${part.name.replace(/"/g, '""')}"` : 'Unknown';
      const cost = part ? (part.unitCost || 0) : 0;
      csv += `${name},${b.qtyNeeded},${part ? part.inStock||0 : 0},${b.status},${cost},${cost * b.qtyNeeded}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_${p ? p.name : 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async showImportAllFromProjectModal(projectId) {
    const otherProjects = this.projects.filter(p => p.id !== projectId);
    if (otherProjects.length === 0) {
      return toast('No other projects available to import from', 'error');
    }
    const projOptions = otherProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    
    const body = `
      <div class="form-group">
        <label class="form-label">Source Project</label>
        <select class="form-select" id="importBomSourceProjectSelect">${projOptions}</select>
      </div>
      <p class="text-sm text-muted">This will copy all BOM items from the selected project into the current project. Existing items in this project's BOM will not be duplicated.</p>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.importAllFromProject('${projectId}', this)">Import Items</button>
    `;
    openModal('Add All from Project', body, footer);
  },

  async importAllFromProject(targetProjectId, btn) {
    if (btn) btn.disabled = true;
    const sourceProjectId = document.getElementById('importBomSourceProjectSelect').value;
    if (!sourceProjectId) {
      if (btn) btn.disabled = false;
      return toast('Please select a source project', 'error');
    }

    try {
      const sourceItems = this.boms.filter(b => b.projectId === sourceProjectId);
      const targetItems = this.boms.filter(b => b.projectId === targetProjectId);
      const targetPartIds = new Set(targetItems.map(b => b.partId));

      let addedCount = 0;
      for (const item of sourceItems) {
        if (!targetPartIds.has(item.partId)) {
          const newId = await DB.add('bom_items', {
            projectId: targetProjectId,
            partId: item.partId,
            qtyNeeded: item.qtyNeeded,
            status: 'not_started'
          });
          const part = this.parts.find(p => p.id === item.partId);
          if (window.HistoryModule) {
            HistoryModule.log('create', 'bom_item', newId || 'new', part ? part.name : 'Unknown Part');
          }
          addedCount++;
        }
      }

      toast(`Successfully imported ${addedCount} items!`, 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(targetProjectId);
    } catch (err) {
      console.error(err);
      if (btn) btn.disabled = false;
      toast('Failed to import items', 'error');
    }
  }
};
