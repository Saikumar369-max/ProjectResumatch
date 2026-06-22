const API_URL = "http://localhost:5000/api";

// ── Toast Notification ───────────────────────────────────
function showToast(message, type = "error") {
  // Remove existing toasts
  document.querySelectorAll(".toast").forEach((t) => t.remove());

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Token Helpers ────────────────────────────────────────
function saveAuth(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  const u = localStorage.getItem("user");
  return u ? JSON.parse(u) : null;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "index.html";
}

// ── Auth Guard ───────────────────────────────────────────
function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function redirectIfLoggedIn() {
  if (getToken()) {
    window.location.href = "dashboard.html";
  }
}

// ── Signup ───────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const originalText = btn.textContent;

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  if (!name || !email || !password) {
    showToast("Please fill in all fields");
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Creating account...';

  try {
    const res = await fetch(`${API_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Signup failed");
      return;
    }

    saveAuth(data);
    showToast("Account created! Redirecting...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 1000);
  } catch (err) {
    showToast("Cannot connect to server. Is the backend running?");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Login ────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const originalText = btn.textContent;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showToast("Please fill in all fields");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in...';

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Login failed");
      return;
    }

    saveAuth(data);
    showToast("Welcome back! Redirecting...", "success");
    setTimeout(() => (window.location.href = "dashboard.html"), 1000);
  } catch (err) {
    showToast("Cannot connect to server. Is the backend running?");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Load Dashboard ───────────────────────────────────────
async function loadDashboard() {
  if (!requireAuth()) return;

  const token = getToken();

  try {
    const res = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      logout();
      return;
    }

    const data = await res.json();
    const user = data.user;

    document.getElementById("user-name").textContent = user.name;
    document.getElementById("profile-name").textContent = user.name;
    document.getElementById("profile-email").textContent = user.email;
    document.getElementById("profile-role").textContent =
      user.role.charAt(0).toUpperCase() + user.role.slice(1);
    document.getElementById("profile-joined").textContent = new Date(
      user.created_at
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (err) {
    showToast("Cannot connect to server");
  }
}
