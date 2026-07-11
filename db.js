// db.js (Hybrid Firestore + IndexedDB Adapter)

const LocalDB = {
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open('orbito_local_db', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items', 'history', 'walk_logs', 'pending_actions', 'sessions'];
        stores.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async getStore(storeName, mode = 'readonly') {
    const db = await this.init();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },
  async getAll(storeName) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async getAllByIndex(storeName, indexName, value) {
    const items = await this.getAll(storeName);
    return items.filter(x => x[indexName] === value);
  },
  async put(storeName, data) {
    if (!data.id) {
      data.id = crypto.randomUUID ? crypto.randomUUID() : ("id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(data);
      req.onsuccess = () => resolve(data.id);
      req.onerror = () => reject(req.error);
    });
  },
  async add(storeName, data) {
    return this.put(storeName, data);
  },
  async delete(storeName, id) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  async clearStore(storeName) {
    const store = await this.getStore(storeName, 'readwrite');
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    
    // In IndexedDB we can read and delete selectively
    const all = await this.getAll(storeName);
    for (const item of all) {
      if (storeName === 'users' && item.id === currentUid) {
        continue; // Preserve logged-in user
      }
      await this.delete(storeName, item.id);
    }
  }
};

const DB = {
  isOffline() {
    return !!window.__orbito_offline || !window.fsdb || !window.FirebaseMethods;
  },

  getFs() {
    if (this.isOffline()) throw new Error("Local DB Mode active");
    if (!window.fsdb || !window.FirebaseMethods) throw new Error("Firebase not initialized");
    return { db: window.fsdb, f: window.FirebaseMethods };
  },

  async getAll(storeName) {
    if (this.isOffline()) {
      return LocalDB.getAll(storeName);
    }
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async getAllByIndex(storeName, indexName, value) {
    if (this.isOffline()) {
      return LocalDB.getAllByIndex(storeName, indexName, value);
    }
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName), f.where(indexName, '==', value));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async add(storeName, data) {
    if (this.isOffline()) {
      return LocalDB.add(storeName, data);
    }
    const { db, f } = this.getFs();
    if (!data.id) {
      data.id = crypto.randomUUID ? crypto.randomUUID() : ("id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data);
    return data.id;
  },

  async put(storeName, data) {
    if (this.isOffline()) {
      return LocalDB.put(storeName, data);
    }
    const { db, f } = this.getFs();
    if (!data.id) throw new Error("ID required for put");
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data, { merge: true });
    return data.id;
  },

  async delete(storeName, id) {
    if (this.isOffline()) {
      return LocalDB.delete(storeName, id);
    }
    const { db, f } = this.getFs();
    const docRef = f.doc(db, storeName, id);
    await f.deleteDoc(docRef);
  },

  async clearStore(storeName) {
    if (this.isOffline()) {
      return LocalDB.clearStore(storeName);
    }
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const batch = f.writeBatch(db);
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    snap.forEach(doc => {
      if (storeName === 'users' && doc.id === currentUid) {
        return; // Preserve the current logged-in user from lockout
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  async addPendingAction(actionData) {
    if (this.isOffline()) {
      if (!actionData.id) {
        actionData.id = crypto.randomUUID ? crypto.randomUUID() : ("pend_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
      }
      return LocalDB.put('pending_actions', actionData);
    }
    const { db, f } = this.getFs();
    if (!actionData.id) {
      actionData.id = crypto.randomUUID ? crypto.randomUUID() : ("pend_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, 'pending_actions', actionData.id);
    await f.setDoc(docRef, actionData);
    return actionData.id;
  },

  async exportAll(options = {}) {
    const excludePII = !!options.excludePII;
    const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items'];
    const data = {
      _metadata: {
        version: 2,
        piiIncluded: !excludePII,
        exportDate: new Date().toISOString(),
        app: 'Orbito'
      }
    };
    for (const store of stores) {
      let records = await this.getAll(store);
      if (excludePII) {
        if (store === 'users') {
          records = records.map(({ email, contact, pin, ...rest }) => rest);
        }
        if (store === 'vendors') {
          records = records.map(({ contact, ...rest }) => rest);
        }
      }
      data[store] = records;
    }
    return data;
  },

  async importAll(data) {
    let currentUserDoc = null;
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    if (currentUid && !this.isOffline()) {
      try {
        const { db, f } = this.getFs();
        const snap = await f.getDoc(f.doc(db, 'users', currentUid));
        if (snap.exists()) {
          currentUserDoc = snap.data();
        }
      } catch (e) {
        console.warn("Could not fetch current user to preserve:", e);
      }
    } else if (currentUid && this.isOffline()) {
      const allUsers = await LocalDB.getAll('users');
      currentUserDoc = allUsers.find(u => u.id === currentUid);
    }

    const storesToClear = ['parts', 'projects', 'tasks', 'bom_items', 'tools', 'locations'];
    for (const store of storesToClear) {
      await this.clearStore(store);
    }
    // Ignore internal metadata block during import (it's an export annotation only).
    for (const store of Object.keys(data)) {
      if (store === '_metadata') continue;
      if (store === 'users' || store === 'vendors' || store === 'settings') {
        continue; // Skip importing/overwriting these to keep existing people and shop data!
      }
      if (Array.isArray(data[store])) {
        for (const item of data[store]) {
          await this.put(store, item);
        }
      }
    }

    // Restore current user if they were deleted. Preserve their original role/status
    // so we don't accidentally privilege-escalate a Student or Lead to Mentor.
    if (currentUserDoc && currentUid) {
      await this.put('users', {
        id: currentUid,
        ...currentUserDoc,
        status: currentUserDoc.status || 'approved',
        role: currentUserDoc.role || 'Student'
      });
    }
  }
};

window.DB = DB;

