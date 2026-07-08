// spreadsheet.js
const SpreadsheetModule = {
  sortField: 'name',
  sortDir: 1,
  hiddenColumns: [],
  columnOrder: ['id', 'name', 'category', 'inStock', 'needed', 'unitCost', 'totalVal', 'vendor', 'location', 'container', 'assignee', 'onshape'],

  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Spreadsheet...</p></div>`;
    await this.loadData();
    this.loadColumnSettings();
    this.renderView();
  },

  async loadData() {
    this.parts = await DB.getAll('parts');
    this.vendors = await DB.getAll('vendors');
    this.locations = await DB.getAll('locations');
    this.people = await DB.getAll('users');
  },

  loadColumnSettings() {
    try {
      const saved = localStorage.getItem('orbito_spreadsheet_columns');
      if (saved) {
        const settings = JSON.parse(saved);
        this.hiddenColumns = settings.hidden || [];
        this.columnOrder = settings.order || this.columnOrder;
      }
    } catch(e) {
      console.warn('Could not load column settings:', e);
    }
  },

  saveColumnSettings() {
    localStorage.setItem('orbito_spreadsheet_columns', JSON.stringify({
      hidden: this.hiddenColumns,
      order: this.columnOrder
    }));
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="ssSearch" placeholder="Search data...">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" onclick="SpreadsheetModule.showColumnSettings()"><i class="fa-solid fa-columns"></i> Columns</button>
          <button class="btn btn-secondary" onclick="SpreadsheetModule.exportCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
      </div>
      
      <div class="table-wrap" style="height:calc(100vh - 180px); overflow-y:auto; border-radius:0;">
        <table class="spreadsheet-table" style="font-size:12px; white-space:nowrap; width:max-content; min-width:100%;">
          <thead style="position:sticky; top:0; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.1), 0 1px 0 var(--border);">
            <tr>
              ${this.renderTableHeaders()}
            </tr>
          </thead>
          <tbody id="ssTbody">
            <!-- Rendered below -->
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('ssSearch').addEventListener('input', debounce(() => this.renderRows(), 150));
    
    // Attach event listener for inline cell editing
    const ssTbody = document.getElementById('ssTbody');
    ssTbody.addEventListener('click', (e) => {
      const cell = e.target.closest('.editable-cell');
      if (!cell || cell.dataset.editing) return;
      
      const partId = cell.dataset.partId;
      const field = cell.dataset.field;
      const type = cell.dataset.type || 'text';
      const originalValue = cell.textContent.trim().replace('$', '');
      
      cell.dataset.editing = 'true';
      cell.innerHTML = `<input type="${type}" class="form-input" style="padding: 2px 6px; font-size:12px; height:24px; width:100%; background:var(--bg-3); border-color:var(--accent)" value="${escapeHTML(originalValue)}">`;
      
      const input = cell.querySelector('input');
      input.focus();
      input.select();
      
      const saveEdit = async () => {
        let newValue = input.value.trim();
        if (type === 'number') {
          newValue = parseFloat(newValue) || 0;
        }
        
        cell.dataset.editing = '';
        
        // Find part and update it
        const part = this.parts.find(p => p.id === partId);
        if (part && part[field] !== newValue) {
          part[field] = newValue;
          try {
            await DB.put('parts', part);
            toast('Value updated inline!', 'success');
            if (window.HistoryModule) {
              HistoryModule.log('update', 'part', partId, part.name, `Inline Edit ${field}: ${newValue}`);
            }
          } catch(err) {
            toast('Failed to save inline edit: ' + err.message, 'error');
          }
        }
        
        await this.loadData();
        this.renderRows();
      };
      
      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          saveEdit();
        } else if (evt.key === 'Escape') {
          cell.dataset.editing = '';
          this.renderRows();
        }
      });
      
      input.addEventListener('blur', saveEdit);
    });

    this.renderRows();
  },

  toggleSort(field) {
    if (this.sortField === field) {
      this.sortDir *= -1;
    } else {
      this.sortField = field;
      this.sortDir = 1;
    }
    this.renderView();
  },

  getSortIcon(field) {
    if (this.sortField !== field) return '<i class="fa-solid fa-sort" style="opacity:0.3;margin-left:4px"></i>';
    return this.sortDir === 1 ? '<i class="fa-solid fa-sort-up" style="margin-left:4px"></i>' : '<i class="fa-solid fa-sort-down" style="margin-left:4px"></i>';
  },

  renderTableHeaders() {
    const columnDefs = {
      id: { label: 'ID', sortable: false },
      name: { label: 'Part Name', sortable: true },
      category: { label: 'Category', sortable: true },
      inStock: { label: 'Stock', sortable: true },
      needed: { label: 'Needed', sortable: true },
      unitCost: { label: 'Unit Cost', sortable: true },
      totalVal: { label: 'Total Value', sortable: true },
      vendor: { label: 'Vendor', sortable: true },
      location: { label: 'Location', sortable: true },
      container: { label: 'Container', sortable: false },
      assignee: { label: 'Assignee', sortable: false },
      onshape: { label: 'Onshape', sortable: false }
    };

    return this.columnOrder
      .filter(col => !this.hiddenColumns.includes(col))
      .map(col => {
        const def = columnDefs[col];
        if (!def) return '';
        const sortableAttr = def.sortable ? `onclick="SpreadsheetModule.toggleSort('${col}')"` : '';
        const cursorStyle = def.sortable ? 'cursor:pointer' : '';
        return `<th style="padding:6px 12px;border-right:1px solid var(--border);${cursorStyle}" ${sortableAttr}>${def.label} ${def.sortable ? this.getSortIcon(col) : ''}</th>`;
      }).join('');
  },

  showColumnSettings() {
    const columnDefs = {
      id: 'ID',
      name: 'Part Name',
      category: 'Category',
      inStock: 'Stock',
      needed: 'Needed',
      unitCost: 'Unit Cost',
      totalVal: 'Total Value',
      vendor: 'Vendor',
      location: 'Location',
      container: 'Container',
      assignee: 'Assignee',
      onshape: 'Onshape'
    };

    openModal('Column Settings', `
      <div style="max-height:400px;overflow-y:auto;padding:8px 0">
        <p class="text-sm text-muted mb-3">Toggle columns to show or hide in the spreadsheet.</p>
        <div class="grid-2" style="gap:8px">
          ${Object.entries(columnDefs).map(([key, label]) => `
            <label class="flex items-center gap-2" style="padding:8px;background:var(--bg-2);border-radius:6px;cursor:pointer">
              <input type="checkbox" class="column-toggle" data-column="${key}" ${!this.hiddenColumns.includes(key) ? 'checked' : ''} style="accent-color:var(--accent)">
              <span class="text-sm">${escapeHTML(label)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-secondary" onclick="SpreadsheetModule.resetColumnSettings()">Reset Defaults</button>
      <button class="btn btn-primary" onclick="SpreadsheetModule.applyColumnSettings()">Apply</button>
    `);

    window.SpreadsheetModule.applyColumnSettings = () => {
      this.hiddenColumns = [];
      document.querySelectorAll('.column-toggle').forEach(cb => {
        if (!cb.checked) {
          this.hiddenColumns.push(cb.dataset.column);
        }
      });
      this.saveColumnSettings();
      this.renderView();
      this.renderRows();
      closeModal();
      toast('Column settings saved!', 'success');
    };

    window.SpreadsheetModule.resetColumnSettings = () => {
      this.hiddenColumns = [];
      this.columnOrder = ['id', 'name', 'category', 'inStock', 'needed', 'unitCost', 'totalVal', 'vendor', 'location', 'container', 'assignee', 'onshape'];
      this.saveColumnSettings();
      document.querySelectorAll('.column-toggle').forEach(cb => cb.checked = true);
      toast('Column settings reset to defaults', 'info');
    };
  },

  renderRows() {
    const q = document.getElementById('ssSearch').value.toLowerCase();
    const tbody = document.getElementById('ssTbody');
    
    let filtered = this.parts.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));

    filtered.sort((a, b) => {
      let va = a[this.sortField];
      let vb = b[this.sortField];
      if (this.sortField === 'inStock') {
        va = a.inStock || 0;
        vb = b.inStock || 0;
      } else if (this.sortField === 'needed') {
        va = a.needed || 0;
        vb = b.needed || 0;
      } else if (this.sortField === 'unitCost') {
        va = a.unitCost || 0;
        vb = b.unitCost || 0;
      } else if (this.sortField === 'totalVal') {
        va = (a.inStock || 0) * (a.unitCost || 0);
        vb = (b.inStock || 0) * (b.unitCost || 0);
      } else if (this.sortField === 'vendor') {
        const vA = this.vendors.find(v => v.id === a.vendorId);
        const vB = this.vendors.find(v => v.id === b.vendorId);
        va = vA ? vA.name : '';
        vb = vB ? vB.name : '';
      } else if (this.sortField === 'location') {
        const lA = this.locations.find(l => l.id === a.locationId);
        const lB = this.locations.find(l => l.id === b.locationId);
        va = lA ? lA.name : '';
        vb = lB ? lB.name : '';
      } else {
        va = String(va || '').toLowerCase();
        vb = String(vb || '').toLowerCase();
      }
      
      if (va < vb) return -1 * this.sortDir;
      if (va > vb) return 1 * this.sortDir;
      return 0;
    });

    tbody.innerHTML = filtered.map(p => {
      const vendor = this.vendors.find(v => v.id === p.vendorId);
      const loc = this.locations.find(l => l.id === p.locationId);
      const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId);
      const totalVal = (p.inStock || 0) * (p.unitCost || 0);

      const renderCell = (col) => {
        switch(col) {
          case 'id':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border);color:var(--text-1);font-family:monospace;cursor:pointer" onclick="navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))"><i class="fa-solid fa-eye"></i> ${p.id.substring(0,6)}</td>`;
          case 'name':
            return `<td class="editable-cell" data-field="name" data-part-id="${p.id}" style="padding:6px 12px;border-right:1px solid var(--border);font-weight:500;cursor:edit">${escapeHTML(p.name)}</td>`;
          case 'category':
            return `<td class="editable-cell" data-field="category" data-part-id="${p.id}" style="padding:6px 12px;border-right:1px solid var(--border);cursor:edit">${escapeHTML(p.category || '')}</td>`;
          case 'inStock':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${getStockChip(p.inStock||0, p.needed||0, p.id)}</td>`;
          case 'needed':
            return `<td class="editable-cell" data-field="needed" data-type="number" data-part-id="${p.id}" style="padding:6px 12px;border-right:1px solid var(--border);cursor:edit">${p.needed || 0}</td>`;
          case 'unitCost':
            return `<td class="editable-cell" data-field="unitCost" data-type="number" data-part-id="${p.id}" style="padding:6px 12px;border-right:1px solid var(--border);cursor:edit">${formatCurrency(p.unitCost)}</td>`;
          case 'totalVal':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${formatCurrency(totalVal)}</td>`;
          case 'vendor':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(vendor?.name || '')}</td>`;
          case 'location':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(loc?.name || '')}</td>`;
          case 'container':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(p.containerId || '')}</td>`;
          case 'assignee':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(assignee?.name || '')}</td>`;
          case 'onshape':
            return `<td style="padding:6px 12px;border-right:1px solid var(--border)">${p.onshapeUrl ? 'Yes' : 'No'}</td>`;
          default:
            return '';
        }
      };

      return `<tr class="ss-row">${this.columnOrder.filter(col => !this.hiddenColumns.includes(col)).map(col => renderCell(col)).join('')}</tr>`;
    }).join('');
  },

  exportCSV() {
    let csv = "ID,Part Name,Category,Stock,Needed,Unit Cost,Vendor,Location,Container,Assignee\n";
    this.parts.forEach(p => {
      const vendor = this.vendors.find(v => v.id === p.vendorId)?.name || '';
      const loc = this.locations.find(l => l.id === p.locationId)?.name || '';
      const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId)?.name || '';
      
      const row = [
        p.id, p.name, p.category||'', p.inStock||0, p.needed||0, p.unitCost||0, 
        vendor, loc, p.containerId||'', assignee
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      csv += row + "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'orbito-inventory.csv';
    a.click(); URL.revokeObjectURL(url);
    toast('CSV Exported', 'success');
  }
};

window.SpreadsheetModule = SpreadsheetModule;
