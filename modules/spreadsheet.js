// spreadsheet.js
const SpreadsheetModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Spreadsheet...</p></div>`;
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
            <input type="text" id="ssSearch" placeholder="Search data...">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" onclick="SpreadsheetModule.exportCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
      </div>
      
      <div class="table-wrap" style="height:calc(100vh - 180px); overflow-y:auto; border-radius:0;">
        <table class="spreadsheet-table" style="font-size:12px; white-space:nowrap; width:max-content; min-width:100%;">
          <thead style="position:sticky; top:0; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.1), 0 1px 0 var(--border);">
            <tr>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">ID</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Part Name</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Category</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Stock</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Needed</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Unit Cost</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Total Value</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Vendor</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Location</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Container</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Assignee</th>
              <th style="padding:6px 12px;border-right:1px solid var(--border)">Onshape</th>
            </tr>
          </thead>
          <tbody id="ssTbody">
            <!-- Rendered below -->
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('ssSearch').addEventListener('input', debounce(() => this.renderRows(), 150));
    this.renderRows();
  },

  renderRows() {
    const q = document.getElementById('ssSearch').value.toLowerCase();
    const tbody = document.getElementById('ssTbody');
    
    let filtered = this.parts.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));

    tbody.innerHTML = filtered.map(p => {
      const vendor = this.vendors.find(v => v.id === p.vendorId);
      const loc = this.locations.find(l => l.id === p.locationId);
      const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId);
      const totalVal = (p.inStock || 0) * (p.unitCost || 0);

      return `
        <tr class="ss-row" style="cursor:pointer" onclick="navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))">
          <td style="padding:6px 12px;border-right:1px solid var(--border);color:var(--text-1);font-family:monospace">${p.id.substring(0,6)}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border);font-weight:500">${escapeHTML(p.name)}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(p.category || '')}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${getStockChip(p.inStock||0, p.needed||0, p.id)}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${p.needed || 0}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${formatCurrency(p.unitCost)}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${formatCurrency(totalVal)}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(vendor?.name || '')}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(loc?.name || '')}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(p.containerId || '')}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${escapeHTML(assignee?.name || '')}</td>
          <td style="padding:6px 12px;border-right:1px solid var(--border)">${p.onshapeUrl ? 'Yes' : 'No'}</td>
        </tr>
      `;
    }).join('');
  },

  exportCSV() {
    let csv = "ID,Part Name,Category,Stock,Needed,Unit Cost,Vendor,Location,Container,Assignee\\n";
    this.parts.forEach(p => {
      const vendor = this.vendors.find(v => v.id === p.vendorId)?.name || '';
      const loc = this.locations.find(l => l.id === p.locationId)?.name || '';
      const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId)?.name || '';
      
      const row = [
        p.id, p.name, p.category||'', p.inStock||0, p.needed||0, p.unitCost||0, 
        vendor, loc, p.containerId||'', assignee
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      csv += row + "\\n";
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
