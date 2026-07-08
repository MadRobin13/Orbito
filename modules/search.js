const SearchModule = {
  filters: { type: 'all', status: 'all', location: 'all' },
  recentSearches: [],

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto; padding-top: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="font-size: 28px; margin-bottom: 8px;">Global Search</h2>
          <p class="text-muted">Search across parts, people, tasks, and projects.</p>
        </div>
        
        <div class="search-box" style="margin-bottom: 20px; transform: scale(1.05); transform-origin: top center;">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 18px; left: 16px;"></i>
          <input type="text" id="globalSearchInput" placeholder="Type what you are looking for..." style="padding: 16px 16px 16px 48px; font-size: 18px; border-radius: var(--radius-lg);">
        </div>

        <div class="card" style="margin-bottom: 20px; padding: 16px;">
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <span class="text-sm text-muted" style="font-weight:500">Filters:</span>
            <select class="form-select" id="searchTypeFilter" style="width:auto; padding:6px 12px; font-size:13px;">
              <option value="all">All Types</option>
              <option value="parts">Parts Only</option>
              <option value="projects">Projects Only</option>
              <option value="tasks">Tasks Only</option>
              <option value="people">People Only</option>
            </select>
            <select class="form-select" id="searchStatusFilter" style="width:auto; padding:6px 12px; font-size:13px;">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <button class="btn btn-secondary btn-sm" id="clearFiltersBtn"><i class="fa-solid fa-xmark"></i> Clear</button>
          </div>
        </div>

        <div id="searchResults" class="history-feed"></div>
      </div>
    `;

    this.searchInput = document.getElementById('globalSearchInput');
    this.resultsContainer = document.getElementById('searchResults');
    
    this.searchInput.addEventListener('input', debounce(() => this.performSearch(), 250));
    
    document.getElementById('searchTypeFilter').addEventListener('change', (e) => {
      this.filters.type = e.target.value;
      this.performSearch();
    });
    
    document.getElementById('searchStatusFilter').addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.performSearch();
    });
    
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
      this.filters = { type: 'all', status: 'all', location: 'all' };
      document.getElementById('searchTypeFilter').value = 'all';
      document.getElementById('searchStatusFilter').value = 'all';
      this.performSearch();
    });
    
    // Load all data async
    this.data = { parts: [], projects: [], users: [], tasks: [], locations: [] };
    Promise.all([
      DB.getAll('parts'),
      DB.getAll('projects'),
      DB.getAll('users'),
      DB.getAll('tasks'),
      DB.getAll('locations')
    ]).then(([parts, projects, users, tasks, locations]) => {
      this.data.parts = parts;
      this.data.projects = projects;
      this.data.users = users;
      this.data.tasks = tasks;
      this.data.locations = locations;
      this.searchInput.focus();
      this.loadRecentSearches();
    });
  },

  loadRecentSearches() {
    try {
      const saved = localStorage.getItem('orbito_recent_searches');
      this.recentSearches = saved ? JSON.parse(saved) : [];
    } catch(e) {
      this.recentSearches = [];
    }
  },

  saveRecentSearch(query) {
    if (!query || query.length < 2) return;
    this.recentSearches = this.recentSearches.filter(s => s.toLowerCase() !== query.toLowerCase());
    this.recentSearches.unshift(query);
    this.recentSearches = this.recentSearches.slice(0, 5);
    localStorage.setItem('orbito_recent_searches', JSON.stringify(this.recentSearches));
  },

  performSearch() {
    const q = this.searchInput.value.toLowerCase().trim();
    if (!q) {
      this.showRecentSearches();
      return;
    }

    this.saveRecentSearch(q);
    const results = [];
    
    // Apply type filter
    const shouldIncludeType = (type) => this.filters.type === 'all' || this.filters.type === type;
    
    // Search parts
    if (shouldIncludeType('parts')) {
      this.data.parts.filter(p => {
        const matches = p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q));
        if (!matches) return false;
        if (this.filters.status === 'active') return (p.inStock || 0) < (p.needed || 0);
        if (this.filters.status === 'completed') return (p.inStock || 0) >= (p.needed || 0);
        return true;
      }).forEach(p => {
        const loc = this.data.locations.find(l => l.id === p.locationId);
        results.push({
          type: 'Part',
          icon: 'fa-screwdriver-wrench',
          color: 'var(--blue)',
          title: p.name,
          subtitle: `${p.category || 'No Category'} ${loc ? '• ' + loc.name : ''}`,
          action: () => { navigate('parts').then(()=>PartsModule.showPartDetail(p.id)); }
        });
      });
    }

    // Search Projects
    if (shouldIncludeType('projects')) {
      this.data.projects.filter(p => {
        const matches = p.name.toLowerCase().includes(q);
        if (!matches) return false;
        if (this.filters.status === 'active') return p.status !== 'completed';
        if (this.filters.status === 'completed') return p.status === 'completed';
        return true;
      }).forEach(p => {
        results.push({
          type: 'Project',
          icon: 'fa-folder',
          color: 'var(--accent)',
          title: p.name,
          subtitle: p.status || 'Active',
          action: () => { navigate('projects').then(()=>ProjectsModule.showDetail(p.id)); }
        });
      });
    }

    // Search Tasks
    if (shouldIncludeType('tasks')) {
      this.data.tasks.filter(t => {
        const matches = t.title.toLowerCase().includes(q);
        if (!matches) return false;
        if (this.filters.status === 'active') return t.status !== 'done';
        if (this.filters.status === 'completed') return t.status === 'done';
        return true;
      }).forEach(t => {
        results.push({
          type: 'Task',
          icon: 'fa-check',
          color: 'var(--purple)',
          title: t.title,
          subtitle: t.status,
          action: () => { navigate('tasks').then(()=>TasksModule.showAddModal(t.id)); }
        });
      });
    }

    // Search People
    if (shouldIncludeType('people')) {
      this.data.users.filter(u => u.name.toLowerCase().includes(q) || (u.role && u.role.toLowerCase().includes(q))).forEach(u => {
        results.push({
          type: 'Person',
          icon: 'fa-user',
          color: 'var(--green)',
          title: u.name,
          subtitle: u.role || 'Member',
          action: () => { navigate('people').then(()=>PeopleModule.showDetail(u.id)); }
        });
      });
    }

    if (results.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-ghost"></i>
          <h3>No results found</h3>
          <p>Try using different keywords or adjust your filters.</p>
        </div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = `
      <div class="text-sm text-muted mb-3" style="padding:0 12px">${results.length} result${results.length !== 1 ? 's' : ''} found</div>
      ${results.slice(0, 25).map((r, i) => `
      <div class="history-item card" style="cursor: pointer; padding: 12px; transition: background 0.15s; border-radius: var(--radius-md);" tabindex="0" onclick="window._globalSearchAction(${i})" onmouseover="this.style.background='var(--bg-3)'" onmouseout="this.style.background='var(--bg-2)'">
        <div class="history-icon" style="color: ${r.color}; background: var(--bg-1);">
          <i class="fa-solid ${r.icon}"></i>
        </div>
        <div class="history-body" style="justify-content: center;">
          <div class="history-text" style="font-weight: 500; font-size: 15px;">${escapeHTML(r.title)}</div>
          <div class="history-time" style="font-size: 13px;">${r.type} &bull; ${escapeHTML(r.subtitle)}</div>
        </div>
      </div>
    `).join('')}
    `;

    window._globalSearchAction = (index) => {
      results[index].action();
    };
  },

  showRecentSearches() {
    if (this.recentSearches.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <h3>No recent searches</h3>
          <p>Your recent searches will appear here.</p>
        </div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = `
      <div class="text-sm text-muted mb-3" style="padding:0 12px">Recent searches</div>
      ${this.recentSearches.map((s, i) => `
        <div class="card" style="padding:12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:8px;border-radius:var(--radius-md)" 
             onclick="document.getElementById('globalSearchInput').value='${escapeHTML(s)}';SearchModule.performSearch()">
          <i class="fa-solid fa-clock text-muted"></i>
          <span style="flex:1">${escapeHTML(s)}</span>
          <button class="btn-icon btn-sm" onclick="event.stopPropagation();SearchModule.clearRecentSearch(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `).join('')}
    `;
  },

  clearRecentSearch(index) {
    this.recentSearches.splice(index, 1);
    localStorage.setItem('orbito_recent_searches', JSON.stringify(this.recentSearches));
    this.showRecentSearches();
  }
};

window.SearchModule = SearchModule;
