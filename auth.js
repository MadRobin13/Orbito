// auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

function parseEnvText(text) {
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function getDeviceId() {
  let devId = localStorage.getItem('orbito_device_id');
  if (!devId) {
    devId = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem('orbito_device_id', devId);
  }
  return devId;
}

function getClientPlatform() {
  const ua = navigator.userAgent || '';
  const platform =
    /Windows/i.test(ua) ? 'Windows' :
    /Mac/i.test(ua) ? 'macOS' :
    /Linux/i.test(ua) && !/Android/i.test(ua) ? 'Linux' :
    /Android/i.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/i.test(ua) ? 'iOS' :
    'Unknown';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /Chrome\//i.test(ua) && !/Edg\//i.test(ua) ? 'Chrome' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) && !/Chrome\//i.test(ua) ? 'Safari' :
    'Unknown';
  return `${platform} / ${browser}`;
}

async function loadFirebaseEnv() {

  // import.meta.env is a Vite/bundler-only API — it throws on plain HTTP servers.
  // Safely read it without crashing when served via python -m http.server.
  let buildEnv = {};
  try {
    // eslint-disable-next-line no-undef
    buildEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
  } catch (_) {
    buildEnv = {};
  }

  const env = { ...buildEnv, ...runtimeEnv };

  const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ];

  if (requiredKeys.every(key => env[key])) {
    return env;
  }

  // Check localStorage for saved config
  try {
    const storedConfig = localStorage.getItem('orbito_firebase_config');
    if (storedConfig) {
      const parsed = JSON.parse(storedConfig);
      if (requiredKeys.every(key => parsed[key])) {
        console.log('Using Firebase config from localStorage');
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not load config from localStorage:', e);
  }

  // Try to load from .env file
  try {
    const response = await fetch('./.env', { cache: 'no-store' });
    if (response.ok) {
      return { ...env, ...parseEnvText(await response.text()) };
    }
  } catch (error) {
    console.warn('Local .env file could not be loaded automatically.', error);
  }

  return env;
}

const env = await loadFirebaseEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const hasFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId
].every(Boolean);

let app, auth, db;
let firebaseAvailable = false;

try {
  if (hasFirebaseConfig) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Export to window for db.js and modules
    window.fsdb = db;
    window.FirebaseMethods = {
      collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch
    };
    firebaseAvailable = true;
    console.log("Firebase initialized successfully");
  } else {
    console.warn("Firebase configuration incomplete. Google Sign-in will be unavailable. Use offline mode.");
  }
} catch (e) {
  console.error("Firebase init error:", e);
  console.warn("Google Sign-in will be unavailable. Use offline mode.");
}

window.AuthModule = {
  currentUser: null,
  userRole: null,
  currentSession: null,

  // Record a new session in local IndexedDB (and best-effort Firestore if online).
  // Called from checkUserAccess (Google OAuth), enterOfflineMode, and indirectly
  // from any sign-in flow. Never blocks sign-in if DB writes fail.
  async recordSignIn(user, mode /* 'online' | 'offline' */) {
    // Cancel any heartbeat from a previous session so we don't leak timers
    // across refreshes or re-logins in the same tab.
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    try {
      const session = {
        id: (window.uid ? window.uid() : (crypto.randomUUID ? crypto.randomUUID() : ('sess_' + Date.now()))),
        userId: user.uid || user.id,
        userName: user.name || user.displayName || 'Unknown',
        role: user.role || 'Student',
        mode: mode || (window.__orbito_offline ? 'offline' : 'online'),
        deviceId: getDeviceId(),
        platform: getClientPlatform(),
        startedAt: Date.now(),
        endedAt: null,
        lastActiveAt: Date.now()
      };
      this.currentSession = session;

      // Local write (always)
      if (window.DB && window.DB.add) {
        window.DB.add('sessions', session).catch(e => console.warn('Local session write failed:', e));
      }

      // Activity feed (always)
      if (window.HistoryModule && window.HistoryModule.log) {
        window.HistoryModule.log('signin', 'session', session.id, session.userName, `${session.mode} · ${session.platform}`).catch(() => {});
      }

      // Cloud mirror (best-effort, only when Firebase is live)
      if (window.fsdb && window.FirebaseMethods && !window.__orbito_offline) {
        try {
          const { collection, doc, setDoc } = window.FirebaseMethods;
          await setDoc(doc(collection(window.fsdb, 'sessions'), session));
        } catch (e) {
          console.warn('Cloud session mirror failed:', e);
        }
      }

      // Heartbeat: keep lastActiveAt fresh while the page is open
      this._heartbeatTimer = setInterval(() => {
        if (!this.currentSession) return;
        this.currentSession.lastActiveAt = Date.now();
        if (window.DB && window.DB.put) {
          window.DB.put('sessions', this.currentSession).catch(() => {});
        }
      }, 60_000);
      // Don't let the heartbeat keep the page alive after we tab away.
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        }, { once: true });
      }
    } catch (e) {
      console.warn('Could not record sign-in:', e);
    }
  },

  async recordSignOut(reason) {
    const session = this.currentSession;
    if (!session) return;
    const userName = this.currentUser?.name || session.userName;
    try {
      session.endedAt = Date.now();
      session.endReason = reason || 'user';
      // Local
      await window.DB.put('sessions', session).catch(e => console.warn('Local session end write failed:', e));
      // Activity
      await window.HistoryModule.log('signout', 'session', session.id, userName, `${session.mode} · ${session.platform} (${reason || 'user'})`).catch(() => {});
      // Cloud mirror (best-effort)
      if (window.fsdb && window.FirebaseMethods && !window.__orbito_offline) {
        try {
          const { collection, doc, setDoc } = window.FirebaseMethods;
          await setDoc(doc(collection(window.fsdb, 'sessions'), session));
        } catch (e) {}
      }
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
      this.currentSession = null;
    } catch (e) {
      console.warn('Could not record sign-out:', e);
    }
  },

  init() {
    const googleBtn = document.getElementById('googleSignInBtn');
    const mainOfflineBtn = document.getElementById('mainOfflineBtn');

    // Disable Google Sign-in if Firebase is not available
    if (!firebaseAvailable) {
      if (googleBtn) {
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fa-brands fa-google"></i> Sign in Unavailable';
        googleBtn.title = 'Firebase configuration missing. Use offline mode or configure Firebase.';
      }
      console.warn('Google Sign-in disabled: Firebase not configured');
    } else if (googleBtn) {
      googleBtn.addEventListener('click', () => this.signIn());
    }

    if (mainOfflineBtn) {
      mainOfflineBtn.addEventListener('click', () => this.enterOfflineMode());
    }

    // Add configure button if Firebase is not available
    if (!firebaseAvailable) {
      const authCard = document.querySelector('.auth-card');
      if (authCard) {
        const configBtn = document.createElement('button');
        configBtn.className = 'btn btn-ghost';
        configBtn.style.width = '100%';
        configBtn.style.justifyContent = 'center';
        configBtn.style.marginTop = '8px';
        configBtn.innerHTML = '<i class="fa-solid fa-gear"></i> Configure Firebase';
        configBtn.onclick = () => this.showConfigModal();
        authCard.appendChild(configBtn);
      }
    }

    if (!auth) {
      this.showOfflineUI();
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('pendingOverlay').style.display = 'none';
      document.getElementById('app-container').style.display = 'none';

      if (user) {
        await this.checkUserAccess(user);
      } else {
        document.getElementById('authOverlay').style.display = 'flex';
        this.currentUser = null;
        this.userRole = null;
      }
    });
  },

  showConfigModal() {
    const modalBody = `
      <p class="text-muted mb-4">Enter your Firebase configuration to enable Google Sign-in. This will be stored locally in your browser.</p>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input type="text" class="form-input" id="fbApiKey" placeholder="AIzaSy...">
      </div>
      <div class="form-group">
        <label class="form-label">Auth Domain</label>
        <input type="text" class="form-input" id="fbAuthDomain" placeholder="your-project.firebaseapp.com">
      </div>
      <div class="form-group">
        <label class="form-label">Project ID</label>
        <input type="text" class="form-input" id="fbProjectId" placeholder="your-project-id">
      </div>
      <div class="form-group">
        <label class="form-label">Storage Bucket</label>
        <input type="text" class="form-input" id="fbStorageBucket" placeholder="your-project.appspot.com">
      </div>
      <div class="form-group">
        <label class="form-label">Messaging Sender ID</label>
        <input type="text" class="form-input" id="fbSenderId" placeholder="123456789">
      </div>
      <div class="form-group">
        <label class="form-label">App ID</label>
        <input type="text" class="form-input" id="fbAppId" placeholder="1:123456789:web:abc123">
      </div>
      <div class="form-group">
        <label class="form-label">Measurement ID (optional)</label>
        <input type="text" class="form-input" id="fbMeasurementId" placeholder="G-XXXXXXXXXX">
      </div>
    `;
    const modalFooter = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveFbConfigBtn">Save & Reload</button>
    `;
    openModal('Configure Firebase', modalBody, modalFooter);

    document.getElementById('saveFbConfigBtn').addEventListener('click', () => {
      const config = {
        VITE_FIREBASE_API_KEY: document.getElementById('fbApiKey').value,
        VITE_FIREBASE_AUTH_DOMAIN: document.getElementById('fbAuthDomain').value,
        VITE_FIREBASE_PROJECT_ID: document.getElementById('fbProjectId').value,
        VITE_FIREBASE_STORAGE_BUCKET: document.getElementById('fbStorageBucket').value,
        VITE_FIREBASE_MESSAGING_SENDER_ID: document.getElementById('fbSenderId').value,
        VITE_FIREBASE_APP_ID: document.getElementById('fbAppId').value,
        VITE_FIREBASE_MEASUREMENT_ID: document.getElementById('fbMeasurementId').value
      };
      
      const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID'];
      const missing = required.filter(key => !config[key]);
      
      if (missing.length > 0) {
        alert('Please fill in all required fields: ' + missing.join(', '));
        return;
      }
      
      localStorage.setItem('orbito_firebase_config', JSON.stringify(config));
      closeModal();
      location.reload();
    });
  },

  showOfflineUI() {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authOverlay').innerHTML = `
      <div class="auth-card" style="border: 1px solid var(--border)">
        <i class="fa-solid fa-cloud-slash fa-3x mb-4 text-amber"></i>
        <h2>Offline / Local Mode</h2>
        <p class="text-muted mb-4">Firebase connection is unconfigured or unavailable. You can proceed in local-only offline mode.</p>
        <button id="workOfflineBtn" class="btn btn-primary" style="width:100%;justify-content:center"><i class="fa-solid fa-wifi-slash"></i> Work Offline</button>
      </div>
    `;
    const btn = document.getElementById('workOfflineBtn');
    if (btn) {
      btn.addEventListener('click', () => this.enterOfflineMode());
    }
  },

  enterOfflineMode() {
    window.__orbito_offline = true;
    this.currentUser = {
      uid: 'offline_mentor',
      id: 'offline_mentor',
      name: 'Offline Mentor',
      role: 'Mentor',
      status: 'approved'
    };
    this.userRole = 'Mentor';
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('pendingOverlay').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    const currentUserNameEl = document.getElementById('currentUserName');
    if (currentUserNameEl) currentUserNameEl.textContent = 'Offline Mentor';
    const sidebarUser = document.getElementById('sidebarUser');
    if (sidebarUser) sidebarUser.style.display = '';

    // Now initialize the app
    App.init();
    this.recordSignIn(this.currentUser, 'offline');
    toast('Running in Local Offline Mode!', 'success');
  },

  canPerform(action) {
    if (!this.userRole) return false;
    const role = this.userRole;
    
    // Role Hierarchy: Mentor > Lead > Student
    const permissions = {
      'approve_users': ['Mentor'],
      'delete_data': ['Mentor'],
      'edit_roles': ['Mentor'],
      'manage_workspace': ['Mentor', 'Lead'],
      'edit_parts': ['Mentor', 'Lead'],
      'edit_projects': ['Mentor', 'Lead'],
      'manage_tasks': ['Mentor', 'Lead', 'Student'], // Let students manage tasks
      'checkout_tools': ['Mentor', 'Lead', 'Student'], // Let students checkout tools
      'view_all': ['Mentor', 'Lead', 'Student'],
      'edit_own_tasks': ['Mentor', 'Lead', 'Student']
    };

    if (!permissions[action]) return false;
    return permissions[action].includes(role);
  },

  async signIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in error:", error);
      alert("Sign in failed: " + error.message);
    }
  },

  async signOut() {
    await this.recordSignOut('user');
    if (window.__orbito_offline) {
      location.reload();
      return;
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  },

  async checkUserAccess(user) {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // New user - default to pending Student
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          role: 'Student', // Default role
          status: 'pending',
          createdAt: Date.now()
        });
        document.getElementById('pendingOverlay').style.display = 'flex';
      } else {
        const userData = userSnap.data();
        if (userData.status === 'approved') {
          this.currentUser = userData;
          this.userRole = userData.role;
          document.getElementById('app-container').style.display = 'flex';

          // Show user info in sidebar
          const currentUserNameEl = document.getElementById('currentUserName');
          if (currentUserNameEl) currentUserNameEl.textContent = userData.name;
          const sidebarUser = document.getElementById('sidebarUser');
          if (sidebarUser) sidebarUser.style.display = '';

          // Now initialize the app
          App.init();
          // Record the sign-in session (offline-style failover already handled elsewhere)
          this.recordSignIn(userData, 'online');
        } else {
          document.getElementById('pendingOverlay').style.display = 'flex';
        }
      }
    } catch (e) {
      console.error("Error checking access:", e);
      this.showOfflineUI();
      toast("Authentication failed. Switched to offline interface.", "error");
    }
  }
};

// Start auth flow — DOM is ready by the time this module finishes executing.
// IMPORTANT: top-level await (used above for loadFirebaseEnv) causes the browser to fire
// DOMContentLoaded BEFORE this module completes, so the event will already have fired by
// the time we reach this line. We must check readyState and call init() directly if so.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.AuthModule.init());
} else {
  window.AuthModule.init();
}

