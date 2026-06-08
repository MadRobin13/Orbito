// auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDo47kaPkgNqF6PID07SxNyIi0D3wRcEZM",
  authDomain: "orbito-a7c1d.firebaseapp.com",
  projectId: "orbito-a7c1d",
  storageBucket: "orbito-a7c1d.firebasestorage.app",
  messagingSenderId: "83395229819",
  appId: "1:83395229819:web:7c99c516974781083f8ade",
  measurementId: "G-H3238BRN5N"
};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Export to window for db.js and modules
  window.fsdb = db;
  window.FirebaseMethods = {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch
  };
} catch (e) {
  console.error("Firebase init error (Did you add your config?):", e);
}

window.AuthModule = {
  currentUser: null,
  userRole: null,

  init() {
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.signIn());
    }

    if (!auth) {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('authOverlay').innerHTML = `
        <div class="auth-card" style="border: 2px solid var(--red)">
          <h2>Configuration Missing</h2>
          <p class="text-muted">Please add your Firebase Config to <code>auth.js</code></p>
        </div>
      `;
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
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('authOverlay').innerHTML += `<p class="text-red mt-4">Database Error: Make sure Firestore is enabled and rules allow read/write.</p>`;
    }
  }
};

// Start auth flow when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.AuthModule.init();
});
