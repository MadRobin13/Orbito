// workspace.js — Enhanced with photos, containers, walk-to-part navigation
const WorkspaceModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.locations = await DB.getAll('locations');
    this.parts = await DB.getAll('parts');
    this.tools = await DB.getAll('tools');
    
    // Fetch global settings for floorplan
    this.settings = await DB.getAll('settings');
    this.floorplan = this.settings.find(s => s.id === 'global_floorplan')?.value || null;
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h2 style="font-size:18px;font-weight:600">Workspace Map</h2>
        </div>
        <div class="toolbar-right">
          ${this.floorplan ? `
            <button class="btn btn-secondary" id="addZoneBtn"><i class="fa-solid fa-plus"></i> Add Zone</button>
            <button class="btn btn-secondary" id="drawGlobalZonesBtn"><i class="fa-solid fa-draw-polygon"></i> Draw Zones</button>
            <button class="btn btn-secondary" id="zoneTemplateBtn"><i class="fa-solid fa-layer-group"></i> Templates</button>
            <button class="btn btn-secondary" onclick="document.getElementById('floorplanInput').click()"><i class="fa-solid fa-image"></i> Change Floorplan</button>
          ` : `
            <button class="btn btn-primary" onclick="document.getElementById('floorplanInput').click()"><i class="fa-solid fa-upload"></i> Upload Floorplan</button>
          `}
          <input type="file" id="floorplanInput" accept="image/*" style="display:none">
        </div>
      </div>
      
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <div class="ws-map" id="workspaceMap" style="background-image:url('${this.floorplan || ''}'); background-size:contain; background-position:center; background-repeat:no-repeat;"></div>
          <div class="mt-4 flex gap-4 text-sm text-muted" style="flex-wrap:wrap">
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#3b82f6"></span> Storage</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#10b981"></span> Workspace</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#f59e0b"></span> Machine</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#8b5cf6"></span> Other</div>
          </div>
        </div>
        <div style="width:320px;min-width:280px" id="zoneDetailPanel">
          <div class="empty-state" style="padding:40px 20px"><p>Click a zone on the map to see its contents.</p></div>
        </div>
      </div>
    `;

    if (document.getElementById('addZoneBtn')) {
      document.getElementById('addZoneBtn').addEventListener('click', () => this.showAddModal());
    }
    if (document.getElementById('drawGlobalZonesBtn')) {
      document.getElementById('drawGlobalZonesBtn').addEventListener('click', () => this.drawGlobalZones());
    }
    if (document.getElementById('zoneTemplateBtn')) {
      document.getElementById('zoneTemplateBtn').addEventListener('click', () => this.showZoneTemplates());
    }

    document.getElementById('floorplanInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const data = await readFileAsDataURL(file);
      await DB.put('settings', { id: 'global_floorplan', value: data });
      toast('Floorplan uploaded!', 'success');
      this.render(this.container);
    });

    this.renderMap();
    this.showZonesList();
  },

  drawGlobalZones() {
    const boxes = this.locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      x: loc.x, y: loc.y, w: loc.w, h: loc.h
    }));

    AnnotateModule.open(this.floorplan, boxes, async (newBoxes) => {
      // Find deleted zones
      const newBoxIds = newBoxes.map(b => b.id);
      for (const loc of this.locations) {
        if (!newBoxIds.includes(loc.id)) {
          // Unassign parts/tools before delete
          for (const p of this.parts.filter(x => x.locationId === loc.id)) { p.locationId = null; p.containerId = null; await DB.put('parts', p); }
          for (const t of this.tools.filter(x => x.locationId === loc.id)) { t.locationId = null; await DB.put('tools', t); }
          await DB.delete('locations', loc.id);
          HistoryModule.log('delete', 'zone', loc.id, loc.name, 'Deleted via map draw');
        }
      }

      // Update or create zones
      for (const box of newBoxes) {
        const existing = this.locations.find(l => l.id === box.id);
        if (existing) {
          existing.x = box.x; existing.y = box.y; existing.w = box.w; existing.h = box.h; existing.name = box.name;
          await DB.put('locations', existing);
        } else {
          await DB.put('locations', {
            id: box.id, name: box.name,
            x: box.x, y: box.y, w: box.w, h: box.h,
            type: 'workspace', color: '#3b82f6', photo: '', containers: []
          });
          HistoryModule.log('create', 'zone', box.id, box.name, 'Created via map draw');
        }
      }

      toast('Zones saved to map!', 'success');
      await this.loadData();
      this.renderView();
    });
  },

  renderMap() {
    const map = document.getElementById('workspaceMap');
    
    if (this.locations.length === 0 && !this.floorplan) {
      map.innerHTML = `<div class="empty-state" style="height:100%"><i class="fa-solid fa-map-location-dot"></i><h3>No Floorplan</h3><p>Upload a floorplan photo to get started.</p></div>`;
      return;
    }
    if (this.locations.length === 0) {
      map.innerHTML = `<div class="empty-state" style="height:100%;background:rgba(0,0,0,0.5);"><i class="fa-solid fa-draw-polygon"></i><h3>No Zones</h3><p>Click "Draw Zones on Map" to outline areas.</p></div>`;
      return;
    }

    map.innerHTML = this.locations.map(loc => {
      const partsCount = this.parts.filter(p => p.locationId === loc.id).length;
      const toolsCount = this.tools.filter(t => t.locationId === loc.id).length;
      const hasPhoto = loc.photo ? `background-image:url('${loc.photo}');background-size:cover;background-position:center;` : '';
      const containerCount = (loc.containers || []).length;
      
      return `
        <div class="ws-zone ${loc.photo ? 'has-photo' : ''}" 
             style="left:${loc.x}%;top:${loc.y}%;width:${loc.w}%;height:${loc.h}%;${hasPhoto}${!hasPhoto ? `background-color:${loc.color}20;` : ''}border-color:${loc.color}80;color:${loc.color}" 
             onclick="WorkspaceModule.showDetail('${loc.id}')">
          <div class="ws-zone-title" ${hasPhoto ? 'style="background:rgba(0,0,0,0.6);color:#fff;padding:2px 6px;border-radius:4px;display:inline-block"' : ''}>${escapeHTML(loc.name)}</div>
          <div class="ws-zone-meta" ${hasPhoto ? 'style="background:rgba(0,0,0,0.5);color:#fff;padding:1px 4px;border-radius:3px;display:inline-block;font-size:10px"' : ''}>${partsCount}P | ${toolsCount}T${containerCount ? ` | ${containerCount}C` : ''}</div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(id = null) {
    const loc = id ? this.locations.find(x => x.id === id) : { x: 10, y: 10, w: 20, h: 20, color: '#3b82f6', type: 'storage', containers: [] };
    
    const body = `
      <form id="zoneForm">
        <div class="form-group">
          <label class="form-label">Zone Name</label>
          <input type="text" class="form-input" id="zoneName" value="${escapeHTML(loc.name || '')}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="zoneType" onchange="document.getElementById('zoneColor').value = this.options[this.selectedIndex].dataset.color">
              <option value="storage" data-color="#3b82f6" ${loc.type === 'storage' ? 'selected' : ''}>Storage</option>
              <option value="workspace" data-color="#10b981" ${loc.type === 'workspace' ? 'selected' : ''}>Workspace</option>
              <option value="machine" data-color="#f59e0b" ${loc.type === 'machine' ? 'selected' : ''}>Machine</option>
              <option value="other" data-color="#8b5cf6" ${loc.type === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Color Hex</label>
            <input type="text" class="form-input" id="zoneColor" value="${escapeHTML(loc.color)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Zone Photo</label>
          <div class="flex items-center gap-3">
            ${loc.photo ? `<img src="${loc.photo}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : ''}
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">
              <i class="fa-solid fa-camera"></i> ${loc.photo ? 'Change' : 'Upload'} Photo
              <input type="file" accept="image/*" id="zonePhotoInput" style="display:none">
            </label>
          </div>
          <input type="hidden" id="zonePhotoData" value="">
        </div>

        ${loc.photo ? `
          <div class="form-group">
            <label class="form-label">Containers <span class="text-muted text-xs">(${(loc.containers||[]).length} defined)</span></label>
            <button type="button" class="btn btn-secondary btn-sm" id="drawContainersBtn">
              <i class="fa-solid fa-draw-polygon"></i> Draw Containers on Photo
            </button>
          </div>
        ` : '<p class="text-sm text-muted mt-2"><i class="fa-solid fa-info-circle"></i> Upload a photo first, then you can draw container boundaries on it.</p>'}

        <h4 class="mt-4 mb-2 text-sm font-semibold text-muted">Position is managed by Map Drawer</h4>
        <div class="grid-4" style="display:none">
          <div class="form-group"><input type="number" id="zoneX" value="${loc.x}"></div>
          <div class="form-group"><input type="number" id="zoneY" value="${loc.y}"></div>
          <div class="form-group"><input type="number" id="zoneW" value="${loc.w}"></div>
          <div class="form-group"><input type="number" id="zoneH" value="${loc.h}"></div>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="WorkspaceModule.saveZone('${id || ''}', this)">Save Zone Details</button>
    `;
    openModal(id ? 'Edit Zone' : 'Add Zone', body, footer);

    // Photo upload handler
    const photoInput = document.getElementById('zonePhotoInput');
    if (photoInput) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const data = await readFileAsDataURL(file);
        document.getElementById('zonePhotoData').value = data;
        toast('Photo loaded!', 'success');
      });
    }

    // Draw containers button
    const drawBtn = document.getElementById('drawContainersBtn');
    if (drawBtn) {
      this._tempContainers = JSON.parse(JSON.stringify(loc.containers || []));
      drawBtn.addEventListener('click', () => {
        const photoSrc = document.getElementById('zonePhotoData').value || loc.photo;
        AnnotateModule.open(photoSrc, this._tempContainers, (containers) => {
          this._tempContainers = containers;
          toast(`${containers.length} containers saved`, 'success');
          // Re-open the zone modal
          this.showAddModal(id);
        });
      });
    }
  },

  async saveZone(id, btn) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('zoneName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Name is required', 'error');
    }

    const newPhoto = document.getElementById('zonePhotoData').value;
    const existing = id ? this.locations.find(x => x.id === id) : {};

    const data = {
      id: id || undefined,
      name,
      type: document.getElementById('zoneType').value,
      color: document.getElementById('zoneColor').value,
      x: parseInt(document.getElementById('zoneX').value) || 10,
      y: parseInt(document.getElementById('zoneY').value) || 10,
      w: parseInt(document.getElementById('zoneW').value) || 20,
      h: parseInt(document.getElementById('zoneH').value) || 20,
      photo: newPhoto || existing.photo || '',
      containers: this._tempContainers || existing.containers || []
    };

    try {
      if (id) {
        await DB.put('locations', data);
        toast('Zone updated', 'success');
        HistoryModule.log('update', 'zone', id, name, `Type: ${data.type}, ${data.containers.length} containers`);
      } else {
        const newId = await DB.add('locations', data);
        toast('Zone added', 'success');
        HistoryModule.log('create', 'zone', newId, name, `Type: ${data.type}`);
      }
      
      this._tempContainers = null;
      closeModal();
      await this.loadData();
      this.renderView();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving zone', 'error');
    }
  },

  showZonesList() {
    const query = document.getElementById('zoneSearchInput')?.value.toLowerCase() || '';
    const filteredZones = this.locations.filter(loc => loc.name.toLowerCase().includes(query) || loc.type.toLowerCase().includes(query));
    
    const panel = document.getElementById('zoneDetailPanel');
    if (!panel) return;
    
    panel.innerHTML = `
      <div class="card p-3 mb-4">
        <h3 class="text-sm font-semibold mb-3">Filter Zones</h3>
        <div class="search-box mb-3" style="max-width:100%">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="zoneSearchInput" placeholder="Search zones..." value="${escapeHTML(query)}">
        </div>
        <div class="flex flex-col gap-2" style="max-height: 280px; overflow-y: auto;">
          ${filteredZones.length === 0 ? '<p class="text-xs text-muted">No zones match search.</p>' : filteredZones.map(loc => `
            <div class="p-2 border-b text-sm flex justify-between items-center" style="border-bottom:1px solid var(--border); cursor:pointer; background:var(--bg-2); border-radius:var(--radius-sm); margin-bottom: 4px;" onclick="WorkspaceModule.showDetail('${loc.id}')" onmouseover="this.style.background='var(--bg-3)'" onmouseout="this.style.background='var(--bg-2)'">
              <span style="font-weight:500; color:${loc.color || 'var(--text-1)'}"><i class="fa-solid fa-map-pin"></i> ${escapeHTML(loc.name)}</span>
              <span class="badge badge-gray text-xs" style="font-size:9px">${loc.type}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div id="walkLogsPanel"></div>
    `;
    
    // Attach listener for real-time filtering
    document.getElementById('zoneSearchInput').addEventListener('input', () => this.showZonesList());
    
    // Render the walk logs
    this.renderWalkLogs();
  },

  async renderWalkLogs() {
    const logsContainer = document.getElementById('walkLogsPanel');
    if (!logsContainer) return;
    
    try {
      const logs = await DB.getAll('walk_logs');
      logs.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
      const recent = logs.slice(0, 5);
      
      logsContainer.innerHTML = `
        <h4 class="text-sm font-semibold mb-2" style="margin-top:16px"><i class="fa-solid fa-history"></i> Recent Arrivals</h4>
        <div class="card p-3">
          ${recent.length === 0 ? '<p class="text-xs text-muted">No arrivals recorded yet.</p>' : recent.map(l => `
            <div style="font-size:11px; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:6px;">
              <strong>${escapeHTML(l.userName || 'Someone')}</strong> found <strong>${escapeHTML(l.partName)}</strong>
              <div class="text-muted" style="margin-top:2px; font-size:10px">${new Date(l.timestamp).toLocaleTimeString()}</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch(e) {
      console.warn("Could not load walk logs", e);
    }
  },

  showDetail(id) {
    const loc = this.locations.find(x => x.id === id);
    if (!loc) return;

    const zParts = this.parts.filter(p => p.locationId === loc.id);
    const zTools = this.tools.filter(t => t.locationId === loc.id);
    const containers = loc.containers || [];

    this.renderMap();
    
    const panel = document.getElementById('zoneDetailPanel');
    panel.innerHTML = `
      <button class="btn btn-ghost btn-sm mb-3" style="padding-left:0" onclick="WorkspaceModule.showZonesList()"><i class="fa-solid fa-arrow-left"></i> Back to Zones</button>
      <div class="card p-4 mb-4" style="border-top:4px solid ${loc.color}">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 style="font-size:16px;font-weight:600">${escapeHTML(loc.name)}</h3>
            <span class="badge badge-gray text-xs">${loc.type}</span>
          </div>
          <button class="btn-icon btn-sm" onclick="WorkspaceModule.showAddModal('${loc.id}')" title="Edit Zone Details"><i class="fa-solid fa-pen"></i></button>
        </div>

        ${loc.photo ? `
          <div style="margin-top:12px;position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
            <img src="${loc.photo}" style="width:100%;display:block">
            ${containers.map((c, i) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
              const color = colors[i % colors.length];
              return `<div style="position:absolute;left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%;border:2px solid ${color};background:${color}22;border-radius:3px;cursor:pointer" title="${escapeHTML(c.name)}">
                <span style="font-size:9px;background:${color};color:#fff;padding:1px 4px;border-radius:2px;position:absolute;top:-1px;left:-1px;white-space:nowrap">${escapeHTML(c.name)}</span>
              </div>`;
            }).join('')}
          </div>
        ` : ''}

        ${containers.length > 0 ? `
          <div style="margin-top:10px">
            <h4 class="text-xs font-semibold text-muted mb-1">Containers (${containers.length})</h4>
            ${containers.map(c => `<span class="badge badge-blue" style="margin:2px;font-size:10px">${escapeHTML(c.name)}</span>`).join('')}
          </div>
        ` : ''}
      </div>

      <h4 class="text-sm font-semibold mb-2">Tools (${zTools.length})</h4>
      <div class="card mb-4">
        ${zTools.length === 0 ? '<div class="p-3 text-sm text-muted">No tools here</div>' : zTools.map(t => `
          <div class="p-2 border-b text-sm flex justify-between items-center" style="border-bottom:1px solid var(--border)">
            <span>${escapeHTML(t.name)}</span>
            <span class="priority-dot priority-${t.condition==='good'?'low':t.condition==='maintenance'?'medium':'high'}"></span>
          </div>
        `).join('')}
      </div>

      <h4 class="text-sm font-semibold mb-2">Parts (${zParts.length})</h4>
      <div class="card">
        ${zParts.length === 0 ? '<div class="p-3 text-sm text-muted">No parts here</div>' : zParts.map(p => `
          <div class="p-2 border-b text-sm flex justify-between items-center" style="border-bottom:1px solid var(--border)">
            <span class="truncate" style="max-width:140px">${escapeHTML(p.name)}</span>
            <div class="flex items-center gap-2">
              <span class="${(p.inStock||0)<(p.needed||0)?'text-red':''}">${p.inStock||0}</span>
              <button class="btn-icon btn-sm" title="Walk to this part" onclick="WorkspaceModule.showWalkToPartModal('${p.id}')"><i class="fa-solid fa-route" style="font-size:11px"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async showWalkToPartModal(partId) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) { toast('Part not found', 'error'); return; }

    const loc = this.locations.find(l => l.id === part.locationId);
    if (!loc) { toast('This part has no assigned location', 'error'); return; }

    const containers = loc.containers || [];
    const container = part.containerId ? containers.find(c => c.name === part.containerId) : null;

    let step = 1;
    const totalSteps = container ? 3 : 2;

    const getProgressHTML = (currStep) => {
      return `
        <div class="walk-progress" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; position:relative; padding:0 20px;">
          <div style="position:absolute; top:14px; left:30px; right:30px; height:2px; background:var(--bg-3); z-index:1;">
            <div style="height:100%; width:${((currStep - 1) / (totalSteps - 1)) * 100}%; background:var(--accent); transition: width 0.3s;"></div>
          </div>
          <div class="step-node" style="z-index:2; text-align:center;">
            <div style="width:30px; height:30px; border-radius:50%; background:${currStep >= 1 ? 'var(--accent)' : 'var(--bg-3)'}; color:${currStep >= 1 ? '#1c1208' : 'var(--text-3)'}; display:grid; place-items:center; font-weight:700; margin:0 auto 4px; font-size:12px;">1</div>
            <div style="font-size:10px; color:${currStep >= 1 ? 'var(--text-0)' : 'var(--text-3)'}">Zone</div>
          </div>
          <div class="step-node" style="z-index:2; text-align:center;">
            <div style="width:30px; height:30px; border-radius:50%; background:${currStep >= 2 ? 'var(--accent)' : 'var(--bg-3)'}; color:${currStep >= 2 ? '#1c1208' : 'var(--text-3)'}; display:grid; place-items:center; font-weight:700; margin:0 auto 4px; font-size:12px;">2</div>
            <div style="font-size:10px; color:${currStep >= 2 ? 'var(--text-0)' : 'var(--text-3)'}">${totalSteps === 3 ? 'Container' : 'Confirm'}</div>
          </div>
          ${totalSteps === 3 ? `
          <div class="step-node" style="z-index:2; text-align:center;">
            <div style="width:30px; height:30px; border-radius:50%; background:${currStep >= 3 ? 'var(--accent)' : 'var(--bg-3)'}; color:${currStep >= 3 ? '#1c1208' : 'var(--text-3)'}; display:grid; place-items:center; font-weight:700; margin:0 auto 4px; font-size:12px;">3</div>
            <div style="font-size:10px; color:${currStep >= 3 ? 'var(--text-0)' : 'var(--text-3)'}">Confirm</div>
          </div>
          ` : ''}
        </div>
      `;
    };

    const renderStep = () => {
      let stepContent = '';
      let stepTitle = '';
      const progress = getProgressHTML(step);

      if (step === 1) {
        stepTitle = `Find Part: ${escapeHTML(part.name)}`;
        stepContent = `
          ${progress}
          <div class="walk-step">
            <div class="walk-step-icon"><i class="fa-solid fa-location-dot" style="font-size:32px;color:${loc.color}"></i></div>
            <h3 style="margin:12px 0 4px">${escapeHTML(loc.name)}</h3>
            <span class="badge badge-gray">${loc.type}</span>
            ${loc.photo ? `<img src="${loc.photo}" class="walk-photo" style="margin-top:12px;width:100%;max-height:220px;object-fit:cover;border-radius:8px">` : '<p class="text-muted mt-4">No photo available for this zone.</p>'}
            <p class="text-sm text-muted mt-3">Head to this area in your workspace.</p>
          </div>
        `;
      } else if (step === 2 && container) {
        stepTitle = `Find Part: ${escapeHTML(part.name)}`;
        stepContent = `
          ${progress}
          <div class="walk-step">
            <div class="walk-step-icon"><i class="fa-solid fa-box-open" style="font-size:32px;color:var(--blue)"></i></div>
            <h3 style="margin:12px 0 4px">${escapeHTML(container.name)}</h3>
            <p class="text-sm text-muted">Inside ${escapeHTML(loc.name)}</p>
            ${loc.photo ? `
              <div style="position:relative;margin-top:12px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
                <img src="${loc.photo}" style="width:100%;display:block;filter:brightness(0.5)">
                <div style="position:absolute;left:${container.x}%;top:${container.y}%;width:${container.w}%;height:${container.h}%;border:3px solid #3b82f6;background:rgba(59,130,246,0.3);border-radius:4px;animation:pulse-border 1.5s infinite"></div>
              </div>
            ` : ''}
            <p class="text-sm text-muted mt-3">Look for <strong>${escapeHTML(container.name)}</strong> in this area.</p>
          </div>
        `;
      } else {
        // Final step — arrived
        stepTitle = `Confirm Arrival: ${escapeHTML(part.name)}`;
        stepContent = `
          ${progress}
          <div class="walk-step" style="text-align:center">
            <div class="walk-step-icon"><i class="fa-solid fa-flag-checkered" style="font-size:40px;color:var(--green)"></i></div>
            <h3 style="margin:12px 0 8px">Found ${escapeHTML(part.name)}?</h3>
            <p class="text-sm text-muted mb-4">Press the button below to confirm you've arrived.</p>
            <button class="btn btn-primary" style="width:100%;padding:14px;font-size:16px" onclick="WorkspaceModule.confirmArrived('${partId}')">
              <i class="fa-solid fa-check-circle"></i> I've Arrived!
            </button>
          </div>
        `;
      }

      openModal(stepTitle, stepContent, `
        ${step > 1 ? `<button class="btn btn-secondary" onclick="WorkspaceModule._walkStep=-1;WorkspaceModule._walkRender()"><i class="fa-solid fa-arrow-left"></i> Back</button>` : ''}
        <div style="flex:1"></div>
        ${step < totalSteps ? `<button class="btn btn-primary" onclick="WorkspaceModule._walkStep=1;WorkspaceModule._walkRender()">Next <i class="fa-solid fa-arrow-right"></i></button>` : ''}
      `);
    };

    this._walkStep = 0;
    this._walkRender = () => {
      step += this._walkStep;
      if (step < 1) step = 1;
      if (step > totalSteps) step = totalSteps;
      renderStep();
    };

    renderStep();
  },

  async confirmArrived(partId) {
    const part = this.parts.find(p => p.id === partId);
    try {
      await DB.add('walk_logs', {
        partId,
        partName: part?.name || '',
        userId: AuthModule.currentUser?.uid || '',
        userName: AuthModule.currentUser?.name || '',
        timestamp: Date.now()
      });
      HistoryModule.log('arrived', 'part', partId, part?.name || '', 'Confirmed arrival at part location');
      closeModal();
      toast('Arrival confirmed! 🎉', 'success');
    } catch (e) {
      toast('Error logging arrival: ' + e.message, 'error');
    }
  },

  async deleteZone(id) {
    if (!confirm('Delete this zone? Parts and tools will be marked as "No Location".')) return;
    
    const loc = this.locations.find(x => x.id === id);
    for (const p of this.parts.filter(x => x.locationId === id)) {
      p.locationId = null;
      p.containerId = null;
      await DB.put('parts', p);
    }
    for (const t of this.tools.filter(x => x.locationId === id)) {
      t.locationId = null;
      await DB.put('tools', t);
    }

    await DB.delete('locations', id);
    HistoryModule.log('delete', 'zone', id, loc?.name || '', '');
    toast('Zone deleted', 'success');
    closeModal();
    await this.loadData();
    this.renderView();
  },

  showZoneTemplates() {
    const templates = [
      { name: 'Basic Shop Layout', zones: [
        { name: 'Main Storage', type: 'storage', x: 5, y: 5, w: 25, h: 30, color: '#3b82f6' },
        { name: 'Workbench 1', type: 'workspace', x: 35, y: 5, w: 20, h: 20, color: '#10b981' },
        { name: 'Workbench 2', type: 'workspace', x: 60, y: 5, w: 20, h: 20, color: '#10b981' },
        { name: 'CNC Machine', type: 'machine', x: 35, y: 30, w: 25, h: 25, color: '#f59e0b' },
        { name: '3D Printer Area', type: 'workspace', x: 65, y: 30, w: 20, h: 25, color: '#10b981' }
      ]},
      { name: 'Small Workshop', zones: [
        { name: 'Parts Shelf', type: 'storage', x: 5, y: 5, w: 20, h: 40, color: '#3b82f6' },
        { name: 'Main Workbench', type: 'workspace', x: 30, y: 5, w: 40, h: 30, color: '#10b981' },
        { name: 'Tool Cabinet', type: 'storage', x: 75, y: 5, w: 20, h: 40, color: '#3b82f6' },
        { name: 'Assembly Area', type: 'workspace', x: 30, y: 40, w: 65, h: 25, color: '#10b981' }
      ]},
      { name: 'Robotics Lab', zones: [
        { name: 'Electronics Storage', type: 'storage', x: 5, y: 5, w: 15, h: 25, color: '#3b82f6' },
        { name: 'Mechanical Parts', type: 'storage', x: 5, y: 35, w: 15, h: 25, color: '#3b82f6' },
        { name: 'Programming Station', type: 'workspace', x: 25, y: 5, w: 25, h: 20, color: '#10b981' },
        { name: 'Testing Area', type: 'workspace', x: 55, y: 5, w: 40, h: 30, color: '#10b981' },
        { name: 'Robot Build Zone', type: 'workspace', x: 25, y: 30, w: 70, h: 30, color: '#10b981' }
      ]}
    ];

    openModal('Zone Templates', `
      <div class="grid-1" style="gap:12px">
        ${templates.map((t, i) => `
          <div class="card" style="padding:16px;cursor:pointer;border:2px solid transparent;transition:all 0.2s" 
               onmouseover="this.style.borderColor='var(--accent)'" 
               onmouseout="this.style.borderColor='transparent'"
               onclick="WorkspaceModule.applyTemplate(${i})">
            <div style="font-weight:600;margin-bottom:8px"><i class="fa-solid fa-layer-group text-accent"></i> ${escapeHTML(t.name)}</div>
            <div class="text-sm text-muted">${t.zones.length} zones included</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
              ${t.zones.slice(0, 4).map(z => `<span class="badge badge-gray" style="font-size:9px">${escapeHTML(z.name)}</span>`).join('')}
              ${t.zones.length > 4 ? `<span class="badge badge-gray" style="font-size:9px">+${t.zones.length - 4} more</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <p class="text-sm text-muted mt-3"><i class="fa-solid fa-info-circle"></i> This will replace all existing zones with the template layout.</p>
    `, '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>');

    window.WorkspaceModule.applyTemplate = async (templateIndex) => {
      if (!confirm('This will replace all existing zones. Continue?')) return;
      
      const template = templates[templateIndex];
      
      // Clear existing zones
      for (const loc of this.locations) {
        for (const p of this.parts.filter(x => x.locationId === loc.id)) { 
          p.locationId = null; p.containerId = null; await DB.put('parts', p); 
        }
        for (const t of this.tools.filter(x => x.locationId === loc.id)) { 
          t.locationId = null; await DB.put('tools', t); 
        }
        await DB.delete('locations', loc.id);
      }

      // Create template zones
      for (const zone of template.zones) {
        await DB.put('locations', {
          id: crypto.randomUUID ? crypto.randomUUID() : ("zone_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)),
          name: zone.name,
          type: zone.type,
          color: zone.color,
          x: zone.x, y: zone.y, w: zone.w, h: zone.h,
          photo: '',
          containers: []
        });
      }

      toast(`Applied "${template.name}" template!`, 'success');
      HistoryModule.log('create', 'zone_template', null, template.name, `Created ${template.zones.length} zones`);
      closeModal();
      await this.loadData();
      this.renderView();
    };
  }
};

window.WorkspaceModule = WorkspaceModule;
