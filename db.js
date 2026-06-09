// db.js (Cloud Firestore Adapter)
const DB = {
  getFs() {
    if (!window.fsdb || !window.FirebaseMethods) throw new Error("Firebase not initialized");
    return { db: window.fsdb, f: window.FirebaseMethods };
  },

  async getAll(storeName) {
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async getAllByIndex(storeName, indexName, value) {
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName), f.where(indexName, '==', value));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async add(storeName, data) {
    const { db, f } = this.getFs();
    if (!data.id) {
      // Auto-generate a guaranteed unique ID
      data.id = crypto.randomUUID ? crypto.randomUUID() : ("id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data);
    return data.id;
  },

  async put(storeName, data) {
    const { db, f } = this.getFs();
    if (!data.id) throw new Error("ID required for put");
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data, { merge: true });
    return data.id;
  },

  async delete(storeName, id) {
    const { db, f } = this.getFs();
    const docRef = f.doc(db, storeName, id);
    await f.deleteDoc(docRef);
  },

  async clearStore(storeName) {
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
    const { db, f } = this.getFs();
    // actionData should be { actionType: 'create'|'update'|'delete', targetCollection, targetId, data, requestedBy, timestamp }
    if (!actionData.id) {
      actionData.id = crypto.randomUUID ? crypto.randomUUID() : ("pend_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, 'pending_actions', actionData.id);
    await f.setDoc(docRef, actionData);
    return actionData.id;
  },

  async exportAll() {
    const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items'];
    const data = {};
    for (const store of stores) {
      data[store] = await this.getAll(store);
    }
    return data;
  },

  async importAll(data) {
    // Identify current user to preserve them from lockout
    let currentUserDoc = null;
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    if (currentUid) {
      try {
        const { db, f } = this.getFs();
        const snap = await f.getDoc(f.doc(db, 'users', currentUid));
        if (snap.exists()) {
          currentUserDoc = snap.data();
        }
      } catch (e) {
        console.warn("Could not fetch current user to preserve:", e);
      }
    }

    const storesToClear = ['parts', 'projects', 'tasks', 'bom_items', 'tools', 'locations'];
    for (const store of storesToClear) {
      await this.clearStore(store);
    }
    for (const store of Object.keys(data)) {
      if (store === 'users' || store === 'vendors' || store === 'settings') {
        continue; // Skip importing/overwriting these to keep existing people and shop data!
      }
      if (Array.isArray(data[store])) {
        for (const item of data[store]) {
          await this.put(store, item);
        }
      }
    }

    // Restore current user if they were deleted
    if (currentUserDoc && currentUid) {
      await this.put('users', {
        id: currentUid,
        ...currentUserDoc,
        status: 'approved',
        role: 'Mentor'
      });
    }
  }
};

window.DB = DB;
