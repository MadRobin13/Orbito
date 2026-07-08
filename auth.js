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

async function loadFirebaseEnv() {
  const runtimeEnv = (typeof window !== "undefined" && window.__ORBITO_ENV__) ? window.__ORBITO_ENV__ : {};
  const buildEnv = import.meta.env ?? {};
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
try {
  if (!hasFirebaseConfig) {
    throw new Error("Missing Firebase env values. Copy .env.example to .env and fill in the VITE_FIREBASE_* entries.");
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Export to window for db.js and modules
  window.fsdb = db;
  window.FirebaseMethods = {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch
  };
} catch (e) {
  console.error("Firebase init error (check your env configuration):", e);
}

window.AuthModule = {
  currentUser: null,
  userRole: null,

  init() {
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.signIn());
    }

    const mainOfflineBtn = document.getElementById('mainOfflineBtn');
    if (mainOfflineBtn) {
      mainOfflineBtn.addEventListener('click', () => this.enterOfflineMode());
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
    
    // Now initialize the app
    App.init();
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
          
          // Now initialize the app
          App.init();
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

// Start auth flow when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.AuthModule.init();
});

