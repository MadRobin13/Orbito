// history.js — Activity Feed & Pending Approvals
const HistoryModule = {
  async log(action, entityType, entityId, entityName, details) {
    try {
      const user = window.AuthModule?.currentUser;
      await DB.add('history', {
        action,
        entityType,
        entityId,
        entityName: entityName || '',
        userId: user?.uid || 'system',
        userName: user?.name || 'System',
        timestamp: Date.now(),
        details: details || ''
      });
    } catch (e) {
      console.warn('History log failed:', e);
    }
  },

  async render(container) {
    const isMentor = window.AuthModule?.canPerform('approve_users');

    container.innerHTML = `
      <div class="history-header" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div class="tab-group">
          <button class="tab-btn active" data-tab="feed">Activity Feed</button>
          ${isMentor ? '<button class="tab-btn" data-tab="pending">Pending Approvals</button>' : ''}
        </div>
        <div style="flex:1"></div>
        <select id="historyFilter" class="form-select" style="width:auto;min-width:140px">
          <option value="">All Types</option>
          <option value="part">Parts</option>
          <option value="project">Projects</option>
          <option value="task">Tasks</option>
          <option value="tool">Tools</option>
          <option value="vendor">Vendors</option>
          <option value="zone">Zones</option>
          <option value="user">Users</option>
        </select>
      </div>
      <div id="historyContent"></div>
    `;

    const tabs = container.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      if (t.dataset.tab === 'feed') this.renderFeed(container);
      else this.renderPending(container);
    }));

    container.querySelector('#historyFilter').addEventListener('change', () => this.renderFeed(container));

    await this.renderFeed(container);
  },

  async renderFeed(container) {
    const content = container.querySelector('#historyContent');
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px"></i></div>';

    try {
      let items = await DB.getAll('history');
      const filter = container.querySelector('#historyFilter')?.value;
      if (filter) items = items.filter(i => i.entityType === filter);

      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      items = items.slice(0, 100);

      if (items.length === 0) {
        content.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><h3>No activity yet</h3><p>Actions will appear here as your team uses Orbito.</p></div>';
        return;
      }

      content.innerHTML = `<div class="history-feed">${items.map(i => this.renderItem(i)).join('')}</div>`;
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Error loading history</h3><p>${e.message}</p></div>`;
    }
  },

  renderItem(item) {
    const icons = {
      create: 'fa-plus text-green', update: 'fa-pen text-blue',
      delete: 'fa-trash text-red', checkout: 'fa-arrow-right text-amber',
      checkin: 'fa-arrow-left text-green', approve: 'fa-check text-green',
      reject: 'fa-xmark text-red', arrived: 'fa-location-dot text-accent',
      signin: 'fa-arrow-right-to-bracket text-accent',
      signout: 'fa-arrow-right-from-bracket text-muted'
    };
    const icon = icons[item.action] || 'fa-circle-info text-muted';
    const verb = {
      create: 'created', update: 'updated', delete: 'deleted',
      checkout: 'checked out', checkin: 'returned', approve: 'approved',
      reject: 'rejected', arrived: 'arrived at',
      signin: 'signed in to', signout: 'signed out of'
    }[item.action] || item.action;

    const timeAgo = this.timeAgo(item.timestamp);

    return `
      <div class="history-item">
        <div class="history-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="history-body">
          <div class="history-text">
            <strong>${escapeHTML(item.userName)}</strong> ${verb}
            <span class="badge badge-gray" style="font-size:10px">${escapeHTML(item.entityType)}</span>
            <strong>${escapeHTML(item.entityName)}</strong>
            ${item.details ? `<span class="text-muted"> — ${escapeHTML(item.details)}</span>` : ''}
          </div>
          <div class="history-time">${timeAgo}</div>
        </div>
      </div>
    `;
  },

  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(ts);
  },

  async renderPending(container) {
    const content = container.querySelector('#historyContent');
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px"></i></div>';

    try {
      const items = await DB.getAll('pending_actions');
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      if (items.length === 0) {
        content.innerHTML = '<div class="empty-state"><i class="fa-solid fa-check-circle"></i><h3>All clear</h3><p>No pending actions require your approval.</p></div>';
        return;
      }

      content.innerHTML = `<div class="history-feed">${items.map(i => `
        <div class="history-item" style="border-left:3px solid var(--amber)">
          <div class="history-icon"><i class="fa-solid fa-hourglass-half text-amber"></i></div>
          <div class="history-body" style="flex:1">
            <div class="history-text">
              <strong>${escapeHTML(i.requestedBy || 'Unknown')}</strong> wants to
              <span class="badge badge-amber">${escapeHTML(i.actionType)}</span>
              in <strong>${escapeHTML(i.targetCollection)}</strong>
              ${i.data?.name ? ` — "${escapeHTML(i.data.name)}"` : ''}
            </div>
            <div class="history-time">${this.timeAgo(i.timestamp)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" onclick="HistoryModule.approvePending('${i.id}')"><i class="fa-solid fa-check"></i></button>
            <button class="btn btn-danger btn-sm" onclick="HistoryModule.rejectPending('${i.id}')"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
  },

  async approvePending(id) {
    try {
      const items = await DB.getAll('pending_actions');
      const item = items.find(i => i.id === id);
      if (!item) { toast('Action not found', 'error'); return; }

      if (item.actionType === 'create' && item.data) {
        await DB.add(item.targetCollection, item.data);
      } else if (item.actionType === 'update' && item.data) {
        await DB.put(item.targetCollection, item.data);
      } else if (item.actionType === 'delete' && item.targetId) {
        await DB.delete(item.targetCollection, item.targetId);
      }

      await DB.delete('pending_actions', id);
      await this.log('approve', 'pending_action', id, item.targetCollection, `Approved ${item.actionType}`);
      toast('Action approved!', 'success');
      this.renderPending(document.getElementById('pageContent'));
    } catch (e) {
      toast('Approve failed: ' + e.message, 'error');
    }
  },

  async rejectPending(id) {
    if (!confirm('Reject this action?')) return;
    try {
      await DB.delete('pending_actions', id);
      await this.log('reject', 'pending_action', id, '', 'Rejected pending action');
      toast('Action rejected.', 'info');
      this.renderPending(document.getElementById('pageContent'));
    } catch (e) {
      toast('Reject failed: ' + e.message, 'error');
    }
  }
};

window.HistoryModule = HistoryModule;
