// parts.js — Enhanced with assignee, container, onshape, drawings, find part, history logging
const PartsModule = {
  sortField: 'name',
  sortDir: 1,
  selectedParts: new Set(),

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.parts = await DB.getAll('parts');
    this.vendors = await DB.getAll('vendors');
    this.locations = await DB.getAll('locations');
    this.people = await DB.getAll('users');
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="partsSearch" placeholder="Search parts...">
          </div>
          <select class="form-select" style="width:130px" id="partsFilter">
            <option value="all">All Status</option>
            <option value="restock">Needs Restock</option>
          </select>
          <select class="form-select" style="width:130px" id="locFilter">
            <option value="all">All Locations</option>
            ${this.locations.map(l => `<option value="${l.id}">${escapeHTML(l.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-ghost" id="partsExportBtn" title="Export parts as JSON"><i class="fa-solid fa-download"></i> Export JSON</button>
          <label class="btn btn-ghost" style="cursor:pointer" title="Import parts from JSON">
            <i class="fa-solid fa-upload"></i> Import JSON
            <input type="file" id="partsImportFile" accept=".json" style="display:none">
          </label>
          <button class="btn btn-danger" id="bulkDeleteBtn" style="display:none"><i class="fa-solid fa-trash"></i> Delete Selected</button>
          <button class="btn btn-primary" id="addPartBtn"><i class="fa-solid fa-plus"></i> Add Part</button>
        </div>
      </div>
      <div class="table-wrap" id="partsTableWrap"></div>
    `;

    document.getElementById('addPartBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => this.bulkDelete());
    document.getElementById('partsSearch').addEventListener('input', debounce(() => this.renderTable(), 250));
    document.getElementById('partsFilter').addEventListener('change', () => this.renderTable());
    document.getElementById('locFilter').addEventListener('change', () => this.renderTable());
    document.getElementById('partsExportBtn').addEventListener('click', () => this.exportParts());
    document.getElementById('partsImportFile').addEventListener('change', (e) => this.importParts(e));

    this.renderTable();
  },

  toggleSort(field) {
    if (this.sortField === field) this.sortDir *= -1;
    else { this.sortField = field; this.sortDir = 1; }
    this.renderTable();
  },

  toggleSelect(id) {
    if (id === 'all') {
      const checkboxes = document.querySelectorAll('.part-cb');
      const selectAll = document.getElementById('selectAllCb').checked;
      checkboxes.forEach(cb => {
        cb.checked = selectAll;
        if (selectAll) this.selectedParts.add(cb.value);
        else this.selectedParts.delete(cb.value);
      });
    } else {
      if (this.selectedParts.has(id)) this.selectedParts.delete(id);
      else this.selectedParts.add(id);
    }
    const bulkBtn = document.getElementById('bulkDeleteBtn');
    if (bulkBtn) bulkBtn.style.display = this.selectedParts.size > 0 ? '' : 'none';
  },

  async bulkDelete() {
    if (this.selectedParts.size === 0) return;
    if (!confirm(`Delete ${this.selectedParts.size} parts?`)) return;
    for (const id of this.selectedParts) {
      const part = this.parts.find(p => p.id === id);
      await DB.delete('parts', id);
      HistoryModule.log('delete', 'part', id, part?.name || '', 'Bulk delete');
    }
    this.selectedParts.clear();
    toast('Parts deleted', 'success');
    await this.loadData();
    this.renderView();
  },

  getSortIcon(field) {
    if (this.sortField !== field) return '<i class="fa-solid fa-sort" style="opacity:0.3;margin-left:4px"></i>';
    return this.sortDir === 1 ? '<i class="fa-solid fa-sort-up" style="margin-left:4px"></i>' : '<i class="fa-solid fa-sort-down" style="margin-left:4px"></i>';
  },

  renderTable() {
    const query = document.getElementById('partsSearch').value.toLowerCase();
    const filter = document.getElementById('partsFilter').value;
    const locFilter = document.getElementById('locFilter').value;

    let filtered = this.parts.filter(p => p.name.toLowerCase().includes(query) || (p.category && p.category.toLowerCase().includes(query)));
    if (filter === 'restock') {
      filtered = filtered.filter(p => (p.inStock || 0) < (p.needed || 0));
    }
    if (locFilter !== 'all') {
      filtered = filtered.filter(p => p.locationId === locFilter);
    }

    filtered.sort((a,b) => {
      let va = a[this.sortField] || '';
      let vb = b[this.sortField] || '';
      if (this.sortField === 'vendor') {
         const vaObj = this.vendors.find(v=>v.id===a.vendorId); va = vaObj ? vaObj.name : '';
         const vbObj = this.vendors.find(v=>v.id===b.vendorId); vb = vbObj ? vbObj.name : '';
      } else if (this.sortField === 'location') {
         const vaObj = this.locations.find(l=>l.id===a.locationId); va = vaObj ? vaObj.name : '';
         const vbObj = this.locations.find(l=>l.id===b.locationId); vb = vbObj ? vbObj.name : '';
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * this.sortDir;
      if (va > vb) return 1 * this.sortDir;
      return 0;
    });

    const wrap = document.getElementById('partsTableWrap');
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-screwdriver-wrench"></i><h3>No parts found</h3><p>Adjust your filters or add some parts to your inventory.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:40px"><input type="checkbox" id="selectAllCb" onchange="PartsModule.toggleSelect('all')"></th>
            <th style="width:50px">Photo</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('name')">Name ${this.getSortIcon('name')}</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('category')">Category ${this.getSortIcon('category')}</th>
            <th>Assigned To</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('location')">Location ${this.getSortIcon('location')}</th>
            <th style="cursor:pointer" class="text-right" onclick="PartsModule.toggleSort('inStock')">Stock ${this.getSortIcon('inStock')}</th>
            <th style="cursor:pointer" class="text-right" onclick="PartsModule.toggleSort('unitCost')">Cost ${this.getSortIcon('unitCost')}</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => {
            const vendor = this.vendors.find(v => v.id === p.vendorId);
            const loc = this.locations.find(l => l.id === p.locationId);
            const assignee = p.assigneeId ? this.people.find(u => u.uid === p.assigneeId || u.id === p.assigneeId) : null;
            return `
              <tr>
                <td><input type="checkbox" class="part-cb" value="${p.id}" ${this.selectedParts.has(p.id) ? 'checked' : ''} onchange="PartsModule.toggleSelect('${p.id}')"></td>
                <td data-label="Photo">
                  <div style="width:32px;height:32px;border-radius:4px;background:var(--bg-3);overflow:hidden">
                    ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover">` : '<div class="flex items-center justify-center h-full text-muted"><i class="fa-solid fa-image"></i></div>'}
                  </div>
                </td>
                <td data-label="Name" style="font-weight:500">
                  <a href="#" onclick="event.preventDefault();PartsModule.showPartDetail('${p.id}')" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a>
                  ${(p.drawings && p.drawings.length) || p.onshapeUrl ? '<i class="fa-solid fa-paperclip text-muted" style="margin-left:4px;font-size:10px" title="Has drawings"></i>' : ''}
                </td>
                <td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                <td data-label="Assigned">
                  ${assignee ? `<div class="flex items-center gap-1"><div class="avatar" style="width:22px;height:22px;font-size:9px">${initials(assignee.name)}</div><span class="text-sm">${escapeHTML(assignee.name)}</span></div>` : '<span class="text-muted">—</span>'}
                </td>
                <td data-label="Location">${escapeHTML(loc ? loc.name : '—')}${p.containerId ? `<span class="text-muted text-xs"> › ${escapeHTML(p.containerId)}</span>` : ''}</td>
                <td data-label="Stock" class="text-right">${getStockChip(p.inStock||0, p.needed||0, p.id)}</td>
                <td data-label="Cost" class="text-right">${formatCurrency(p.unitCost)}</td>
                <td data-label="Actions" class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    ${p.locationId ? `<button class="btn-icon btn-sm" onclick="PartsModule.findPart('${p.id}')" title="Find Part"><i class="fa-solid fa-route"></i></button>` : ''}
                    <button class="btn-icon btn-sm" onclick="PartsModule.showAdjustModal('${p.id}')" title="Adjust Qty"><i class="fa-solid fa-plus-minus"></i></button>
                    <button class="btn-icon btn-sm" onclick="PartsModule.showEditModal('${p.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon btn-sm" style="color:var(--red)" onclick="PartsModule.deletePart('${p.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  async showAddModal() {
    this.showEditModal(null);
  },

  async showEditModal(id) {
    const p = id ? this.parts.find(x => x.id === id) : {};
    
    const vendorOpts = this.vendors.map(v => `<option value="${v.id}" ${v.id === p.vendorId ? 'selected' : ''}>${escapeHTML(v.name)}</option>`).join('');
    const locOpts = this.locations.map(l => `<option value="${l.id}" ${l.id === p.locationId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('');
    const peopleOpts = this.people.filter(u => u.status === 'approved').map(u => `<option value="${u.uid || u.id}" ${(u.uid === p.assigneeId || u.id === p.assigneeId) ? 'selected' : ''}>${escapeHTML(u.name)}</option>`).join('');

    // Build container options for the selected location
    const selectedLoc = this.locations.find(l => l.id === p.locationId);
    const containerOpts = (selectedLoc?.containers || []).map(c => `<option value="${c.name}" ${c.name === p.containerId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('');

    const body = `
      <form id="partForm">
        <div class="flex gap-4">
          <div style="width:140px">
            <label class="form-label">Photo</label>
            <label class="photo-upload" id="partPhotoUpload">
              ${p.photo ? `<img src="${p.photo}">` : '<i class="fa-solid fa-camera"></i><span>Upload</span>'}
              <input type="file" accept="image/*" id="partPhotoInput">
            </label>
          </div>
          <div style="flex:1">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" class="form-input" id="partName" value="${escapeHTML(p.name || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" id="partCategory" value="${escapeHTML(p.category || '')}">
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="partDesc">${escapeHTML(p.description || '')}</textarea>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Vendor</label>
            <select class="form-select" id="partVendor"><option value="">None</option>${vendorOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned To</label>
            <select class="form-select" id="partAssignee"><option value="">Unassigned</option>${peopleOpts}</select>
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Location</label>
            <select class="form-select" id="partLocation" onchange="PartsModule._updateContainerOpts()"><option value="">None</option>${locOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Container</label>
            <select class="form-select" id="partContainer"><option value="">None</option>${containerOpts}</select>
          </div>
        </div>
        <div class="grid-3">
          <div class="form-group">
            <label class="form-label">Unit Cost ($)</label>
            <input type="number" step="0.01" class="form-input" id="partCost" value="${p.unitCost || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">In Stock</label>
            <input type="number" class="form-input" id="partInStock" value="${p.inStock || 0}">
          </div>
          <div class="form-group">
            <label class="form-label">Needed</label>
            <input type="number" class="form-input" id="partNeeded" value="${p.needed || 0}">
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h4 class="text-sm font-semibold mb-2"><i class="fa-solid fa-drafting-compass"></i> Drawings & CAD</h4>
        <div class="form-group">
          <label class="form-label">Onshape URL</label>
          <input type="url" class="form-input" id="partOnshape" value="${escapeHTML(p.onshapeUrl || '')}" placeholder="https://cad.onshape.com/...">
        </div>
        <div class="form-group">
          <label class="form-label">Drawings / Sketches</label>
          <div id="drawingsPreview" class="flex gap-2" style="flex-wrap:wrap;margin-bottom:8px">
            ${(p.drawings || []).map((d, i) => `
              <div style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border)">
                <img src="${d}" style="width:100%;height:100%;object-fit:cover">
                <button type="button" class="btn-icon" style="position:absolute;top:1px;right:1px;width:18px;height:18px;font-size:10px;background:var(--red);color:#fff;border-radius:50%" onclick="PartsModule._removeDrawing(${i})"><i class="fa-solid fa-xmark"></i></button>
              </div>
            `).join('')}
          </div>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            <i class="fa-solid fa-image"></i> Add Drawing
            <input type="file" accept="image/*" id="drawingInput" multiple style="display:none">
          </label>
        </div>
      </form>
    `;
    
    let currentPhoto = p.photo || null;
    this._currentDrawings = [...(p.drawings || [])];

    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="savePartBtn">Save Part</button>
    `;
    
    openModal(id ? 'Edit Part' : 'Add Part', body, footer);

    document.getElementById('partPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        currentPhoto = await readFileAsDataURL(file);
        document.getElementById('partPhotoUpload').innerHTML = `<img src="${currentPhoto}"><input type="file" accept="image/*" id="partPhotoInput">`;
      }
    });

    document.getElementById('drawingInput').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        const data = await readFileAsDataURL(file);
        this._currentDrawings.push(data);
      }
      this._refreshDrawingsPreview();
    });

    document.getElementById('savePartBtn').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      btn.disabled = true;

      const name = document.getElementById('partName').value.trim();
      if (!name) {
        btn.disabled = false;
        return toast('Name is required', 'error');
      }

      const data = {
        id: p.id,
        name,
        category: document.getElementById('partCategory').value.trim(),
        description: document.getElementById('partDesc').value.trim(),
        vendorId: document.getElementById('partVendor').value || null,
        assigneeId: document.getElementById('partAssignee').value || null,
        locationId: document.getElementById('partLocation').value || null,
        containerId: document.getElementById('partContainer').value || null,
        unitCost: parseFloat(document.getElementById('partCost').value) || 0,
        inStock: parseInt(document.getElementById('partInStock').value) || 0,
        needed: parseInt(document.getElementById('partNeeded').value) || 0,
        photo: currentPhoto,
        onshapeUrl: document.getElementById('partOnshape').value.trim() || null,
        drawings: this._currentDrawings
      };

      try {
        if (id) {
          await DB.put('parts', data);
          toast('Part updated', 'success');
          HistoryModule.log('update', 'part', id, name);
        } else {
          const newId = await DB.add('parts', data);
          toast('Part added', 'success');
          HistoryModule.log('create', 'part', newId, name);
        }
        
        closeModal();
        await this.loadData();
        this.renderView();
      } catch (err) {
        btn.disabled = false;
        toast('Error saving part', 'error');
      }
    });
  },

  _updateContainerOpts() {
    const locId = document.getElementById('partLocation').value;
    const loc = this.locations.find(l => l.id === locId);
    const sel = document.getElementById('partContainer');
    sel.innerHTML = '<option value="">None</option>' + (loc?.containers || []).map(c => `<option value="${c.name}">${escapeHTML(c.name)}</option>`).join('');
  },

  _removeDrawing(index) {
    this._currentDrawings.splice(index, 1);
    this._refreshDrawingsPreview();
  },

  _refreshDrawingsPreview() {
    const el = document.getElementById('drawingsPreview');
    if (!el) return;
    el.innerHTML = this._currentDrawings.map((d, i) => `
      <div style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border)">
        <img src="${d}" style="width:100%;height:100%;object-fit:cover">
        <button type="button" class="btn-icon" style="position:absolute;top:1px;right:1px;width:18px;height:18px;font-size:10px;background:var(--red);color:#fff;border-radius:50%" onclick="PartsModule._removeDrawing(${i})"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `).join('');
  },

  showPartDetail(id) {
    const p = this.parts.find(x => x.id === id);
    if (!p) return;

    const vendor = this.vendors.find(v => v.id === p.vendorId);
    const loc = this.locations.find(l => l.id === p.locationId);
    const assignee = p.assigneeId ? this.people.find(u => u.uid === p.assigneeId || u.id === p.assigneeId) : null;
    const drawings = p.drawings || [];

    openModal(escapeHTML(p.name), `
      <div class="tab-group mb-4">
        <button class="tab-btn active" onclick="PartsModule._switchDetailTab('info', this)">Info</button>
        <button class="tab-btn" onclick="PartsModule._switchDetailTab('drawings', this)">Drawings (${drawings.length})</button>
        <button class="tab-btn" onclick="PartsModule._switchDetailTab('sketch', this); PartsModule._initSketchCanvas();">Sketch Pad</button>
      </div>

      <div id="partDetailInfo">
        ${p.photo ? `<img src="${p.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px">` : ''}
        <div class="grid-2" style="gap:12px">
          <div><span class="text-muted text-xs">Category</span><div>${escapeHTML(p.category || '—')}</div></div>
          <div><span class="text-muted text-xs">Vendor</span><div>${escapeHTML(vendor?.name || '—')}</div></div>
          <div><span class="text-muted text-xs">Location</span><div>${escapeHTML(loc?.name || '—')}${p.containerId ? ` › ${escapeHTML(p.containerId)}` : ''}</div></div>
          <div><span class="text-muted text-xs">Assigned To</span><div>${escapeHTML(assignee?.name || 'Unassigned')}</div></div>
          <div><span class="text-muted text-xs">Stock / Needed</span><div>${getStockChip(p.inStock||0, p.needed||0, p.id)}</div></div>
          <div><span class="text-muted text-xs">Unit Cost</span><div>${formatCurrency(p.unitCost)}</div></div>
        </div>
        ${p.description ? `<div class="mt-3"><span class="text-muted text-xs">Description</span><p class="text-sm">${escapeHTML(p.description)}</p></div>` : ''}
        ${p.onshapeUrl ? `<a href="${escapeHTML(p.onshapeUrl)}" target="_blank" class="btn btn-secondary btn-sm mt-3"><i class="fa-solid fa-cube"></i> Open in Onshape</a>` : ''}
      </div>

      <div id="partDetailDrawings" style="display:none">
        ${drawings.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No drawings attached.</p></div>' : `
          <div class="grid-2" style="gap:8px">
            ${drawings.map(d => `<img src="${d}" style="width:100%;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="window.open(this.src)">`).join('')}
          </div>
        `}
        ${p.onshapeUrl ? `<a href="${escapeHTML(p.onshapeUrl)}" target="_blank" class="btn btn-secondary btn-sm mt-3"><i class="fa-solid fa-cube"></i> Open in Onshape</a>` : ''}
      </div>

      <div id="partDetailSketch" style="display:none">
        <p class="text-sm text-muted mb-2">Draw a quick sketch or diagram for this part.</p>
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;touch-action:none">
          <canvas id="sketchCanvas" width="400" height="300" style="display:block;width:100%"></canvas>
        </div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-secondary" onclick="PartsModule._clearSketch()">Clear</button>
          <button class="btn btn-primary" onclick="PartsModule._saveSketch('${p.id}')">Save to Drawings</button>
        </div>
      </div>
    `, `
      ${p.locationId ? `<button class="btn btn-secondary" onclick="closeModal();PartsModule.findPart('${p.id}')"><i class="fa-solid fa-route"></i> Find Part</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    `);
  },

  _switchDetailTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('partDetailInfo').style.display = tab === 'info' ? '' : 'none';
    document.getElementById('partDetailDrawings').style.display = tab === 'drawings' ? '' : 'none';
    document.getElementById('partDetailSketch').style.display = tab === 'sketch' ? '' : 'none';
  },

  _initSketchCanvas() {
    const canvas = document.getElementById('sketchCanvas');
    if (!canvas || canvas.dataset.init) return;
    canvas.dataset.init = 'true';
    const ctx = canvas.getContext('2d');
    let drawing = false;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
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
  },
  
  _clearSketch() {
    const canvas = document.getElementById('sketchCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  },

  async _saveSketch(id) {
    const canvas = document.getElementById('sketchCanvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const p = this.parts.find(x => x.id === id);
    if (!p) return;
    
    p.drawings = p.drawings || [];
    p.drawings.push(dataUrl);
    await DB.put('parts', p);
    toast('Sketch saved to drawings!', 'success');
    HistoryModule.log('update', 'part', id, p.name, 'Added sketch');
    
    this._clearSketch();
    closeModal();
    this.showPartDetail(id);
  },

  async findPart(id) {
    // Delegate to WorkspaceModule
    if (!WorkspaceModule.parts || !WorkspaceModule.locations) {
      WorkspaceModule.parts = await DB.getAll('parts');
      WorkspaceModule.locations = await DB.getAll('locations');
    }
    WorkspaceModule.showWalkToPartModal(id);
  },

  async showAdjustModal(id) {
    const p = this.parts.find(x => x.id === id);
    if (!p) return;

    const body = `
      <div class="form-group">
        <label class="form-label">Current Stock</label>
        <div style="font-size:24px;font-weight:600">${p.inStock || 0}</div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Adjustment (e.g. 5, -2)</label>
        <input type="number" class="form-input" id="adjAmount" placeholder="0">
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="PartsModule.saveAdjust('${p.id}')">Apply</button>
    `;
    openModal('Adjust Stock: ' + escapeHTML(p.name), body, footer);
  },

  async saveAdjust(id) {
    const p = this.parts.find(x => x.id === id);
    const amt = parseInt(document.getElementById('adjAmount').value) || 0;
    if (amt === 0) return closeModal();

    p.inStock = (p.inStock || 0) + amt;
    await DB.put('parts', p);
    HistoryModule.log('update', 'part', id, p.name, `Stock adjusted by ${amt > 0 ? '+' : ''}${amt}`);
    toast('Stock adjusted', 'success');
    closeModal();
    this.renderTable(); 
  },

  async deletePart(id) {
    if (!confirm('Are you sure you want to delete this part?')) return;
    const part = this.parts.find(p => p.id === id);
    await DB.delete('parts', id);
    HistoryModule.log('delete', 'part', id, part?.name || '');
    toast('Part deleted', 'success');
    await this.loadData();
    this.renderView();
  },

  // ── Parts JSON Export ──
  exportParts() {
    if (this.parts.length === 0) {
      toast('No parts to export.', 'error');
      return;
    }
    // Strip large base64 drawings to keep file small; keep onshapeUrl links
    const exportData = this.parts.map(p => {
      const copy = { ...p };
      if (copy.drawings && copy.drawings.length > 0) {
        copy._drawingsCount = copy.drawings.length;
        delete copy.drawings; // omit heavy base64 blobs
      }
      if (copy.photo && copy.photo.startsWith('data:')) {
        delete copy.photo; // omit base64 photo
      }
      return copy;
    });
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      parts: exportData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbito-parts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${exportData.length} parts.`, 'success');
  },

  // ── Parts JSON Import ──
  async importParts(e) {
    const file = e.target.files[0];
    if (!file) return;
    // Reset input so the same file can be re-imported
    e.target.value = '';

    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (err) {
      toast('Invalid JSON file: ' + err.message, 'error');
      return;
    }

    // Accept either { parts: [...] } wrapper format or a raw array
    const incoming = Array.isArray(payload) ? payload
      : Array.isArray(payload.parts) ? payload.parts
      : null;

    if (!incoming || incoming.length === 0) {
      toast('No parts found in file.', 'error');
      return;
    }

    const action = await new Promise(resolve => {
      openModal(
        'Import Parts',
        `<p style="margin-bottom:12px">Found <strong>${incoming.length}</strong> part(s) in <em>${escapeHTML(file.name)}</em>.</p>
        <p class="text-sm text-muted" style="margin-bottom:16px">Choose how to handle existing parts:</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="radio" name="importMode" value="merge" checked>
            <div>
              <div style="font-weight:500">Merge (recommended)</div>
              <div class="text-sm text-muted">Update matching parts by ID; add new ones. Existing parts not in the file are kept.</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="radio" name="importMode" value="replace">
            <div>
              <div style="font-weight:500">Replace all</div>
              <div class="text-sm text-muted">Delete ALL current parts first, then import. This cannot be undone.</div>
            </div>
          </label>
        </div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
         <button class="btn btn-primary" id="confirmImportBtn">Import</button>`
      );
      document.getElementById('confirmImportBtn').addEventListener('click', () => {
        const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'merge';
        closeModal();
        resolve(mode);
      });
      // If user closes modal without confirming
      const observer = new MutationObserver(() => {
        if (!document.getElementById('confirmImportBtn')) {
          observer.disconnect();
          resolve(null);
        }
      });
      observer.observe(document.getElementById('modalOverlay'), { childList: true, subtree: true });
    });    if (!action) return; // cancelled

    try {
      if (action === 'replace') {
        await DB.clearStore('parts');
      }

      let added = 0, updated = 0;
      for (const part of incoming) {
        if (!part.id) {
          part.id = (window.uid ? window.uid() : (crypto.randomUUID ? crypto.randomUUID() : ('id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11))));
          added++;
        } else {
          const exists = this.parts.find(p => p.id === part.id);
          exists ? updated++ : added++;
        }
        await DB.put('parts', part);
      }

      if (window.HistoryModule) {
        HistoryModule.log('import', 'part', 'bulk', `${incoming.length} parts`, `${action}: +${added} new, ~${updated} updated`);
      }

      toast(`Import complete: ${added} added, ${updated} updated.`, 'success');
      await this.loadData();
      this.renderView();
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    }
  }
};

window.PartsModule = PartsModule;
