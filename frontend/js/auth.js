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
    const u = getUser();
    window.location.href = (u && u.role === "admin") ? "admin_dashboard.html" : "dashboard.html";
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
  const role = (document.getElementById("role")?.value) || "recruiter";

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

// ── Role Toggle (login page) ─────────────────────────────
function selectRole(role) {
  document.getElementById("login-role").value = role;
  document.getElementById("role-recruiter").classList.toggle("active", role === "recruiter");
  document.getElementById("role-admin").classList.toggle("active", role === "admin");
}

// ── Login ────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const originalText = btn.textContent;

  const email        = document.getElementById("email").value.trim();
  const password     = document.getElementById("password").value;
  const selectedRole = (document.getElementById("login-role")?.value) || "recruiter";

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
      // Send role so backend looks in the correct collection
      body: JSON.stringify({ email, password, role: selectedRole }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Login failed");
      return;
    }

    saveAuth(data);
    showToast("Welcome back! Redirecting...", "success");
    const dest = data.user.role === "admin" ? "admin_dashboard.html" : "dashboard.html";
    setTimeout(() => (window.location.href = dest), 1000);
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

// ── Recruiter Stats (scoped) ─────────────────────────────
async function loadRecruiterStats() {
  const token = getToken();
  if (!token) return;

  const ids = ["rc-total-jobs", "rc-total-resumes", "rc-avg-score", "rc-best-match"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("stat-loading");
  });

  try {
    const res = await fetch(`${API_URL}/recruiter/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const s = await res.json();

    function countUp(el, target, suffix, decimals) {
      suffix   = suffix   || "";
      decimals = decimals || 0;
      if (!el) return;
      el.classList.remove("stat-loading");
      if (target === 0) { el.textContent = "0" + suffix; return; }
      const steps = Math.ceil(900 / 16);
      let current = 0;
      const increment = target / steps;
      const timer = setInterval(function () {
        current = Math.min(current + increment, target);
        el.textContent = decimals
          ? current.toFixed(decimals) + suffix
          : Math.round(current) + suffix;
        if (current >= target) clearInterval(timer);
      }, 16);
    }

    countUp(document.getElementById("rc-total-jobs"),    s.total_jobs);
    countUp(document.getElementById("rc-total-resumes"), s.total_resumes);
    countUp(document.getElementById("rc-avg-score"),     s.avg_match_score, "%", 1);
    countUp(document.getElementById("rc-best-match"),    s.best_match, "%");

    var sub = document.getElementById("rc-jobs-sub");
    if (sub) sub.textContent = s.open_jobs + " open · " + s.closed_jobs + " closed";

  } catch (err) {
    // Silently fail
  }
}

// ── Admin Stats Overview ─────────────────────────────────
async function loadAdminStats() {
  const token = getToken();
  if (!token) return;

  // Show skeleton shimmer while loading
  ["stat-total-users", "stat-total-jobs", "stat-total-resumes", "stat-avg-score"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("stat-loading");
  });

  try {
    const res = await fetch(`${API_URL}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;

    const s = await res.json();

    // Helper: animated count-up
    function countUp(el, target, suffix, decimals) {
      suffix   = suffix   || "";
      decimals = decimals || 0;
      if (!el) return;
      el.classList.remove("stat-loading");
      const duration = 900;
      const step = 16;
      const steps = Math.ceil(duration / step);
      let current = 0;
      const increment = target / steps;
      const timer = setInterval(function() {
        current = Math.min(current + increment, target);
        el.textContent = decimals
          ? current.toFixed(decimals) + suffix
          : Math.round(current) + suffix;
        if (current >= target) clearInterval(timer);
      }, step);
    }

    countUp(document.getElementById("stat-total-users"),   s.total_users);
    countUp(document.getElementById("stat-total-jobs"),    s.total_jobs);
    countUp(document.getElementById("stat-total-resumes"), s.total_resumes);
    countUp(document.getElementById("stat-avg-score"),     s.avg_match_score, "%", 1);

    // Jobs open / closed sub-label
    var sub = document.getElementById("stat-jobs-sub");
    if (sub) sub.textContent = s.open_jobs + " open · " + s.closed_jobs + " closed";

  } catch (err) {
    // Silently fail — overview cards are non-critical
  }
}

// ── Admin Charts ─────────────────────────────────────────
async function loadAdminCharts() {
  const token = getToken();
  if (!token) return;

  // ── Global Chart.js dark-theme defaults ──────────────────
  Chart.defaults.color          = "#a0a0b8";
  Chart.defaults.font.family    = "Inter, 'Segoe UI', sans-serif";
  Chart.defaults.font.size      = 12;
  Chart.defaults.borderColor    = "rgba(42,42,74,0.8)";
  Chart.defaults.plugins.legend.labels.boxWidth  = 12;
  Chart.defaults.plugins.legend.labels.padding   = 16;

  const COLORS = {
    red:    "#e94560",
    amber:  "#f39c12",
    green:  "#2ecc71",
    blue:   "#3498db",
    teal:   "#1abc9c",
    purple: "#9b59b6",
    orange: "#e67e22",
    pink:   "#e91e8c",
    cyan:   "#00bcd4",
    lime:   "#8bc34a",
  };
  const TYPE_PALETTE = [
    COLORS.blue, COLORS.teal, COLORS.purple,
    COLORS.orange, COLORS.pink, COLORS.cyan, COLORS.lime,
  ];

  function cardBg() {
    return "rgba(22,33,62,0.9)";   // --bg-card equivalent
  }

  try {
    const res = await fetch(`${API_URL}/admin/charts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const d = await res.json();

    // ── 1. Score Distribution — Doughnut ──────────────────
    const scoreCtx = document.getElementById("chart-score-dist");
    if (scoreCtx) {
      new Chart(scoreCtx, {
        type: "doughnut",
        data: {
          labels: ["Low (0–39)", "Mid (40–69)", "High (70–100)"],
          datasets: [{
            data: [d.score_distribution.low, d.score_distribution.mid, d.score_distribution.high],
            backgroundColor: [
              "rgba(233,69,96,0.85)",
              "rgba(243,156,18,0.85)",
              "rgba(46,204,113,0.85)"
            ],
            borderColor: [COLORS.red, COLORS.amber, COLORS.green],
            borderWidth: 1.5,
            hoverOffset: 8,
          }],
        },
        options: {
          cutout: "68%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} candidates`,
              },
            },
          },
        },
      });
    }

    // ── 2. Jobs by Type — Doughnut ────────────────────────
    const typeCtx = document.getElementById("chart-jobs-type");
    if (typeCtx && d.jobs_by_type.length) {
      new Chart(typeCtx, {
        type: "doughnut",
        data: {
          labels: d.jobs_by_type.map(j => j.type),
          datasets: [{
            data:            d.jobs_by_type.map(j => j.count),
            backgroundColor: d.jobs_by_type.map((_, i) => TYPE_PALETTE[i % TYPE_PALETTE.length].replace(")", ",0.85)").replace("rgb", "rgba")),
            borderColor:     d.jobs_by_type.map((_, i) => TYPE_PALETTE[i % TYPE_PALETTE.length]),
            borderWidth: 1.5,
            hoverOffset: 8,
          }],
        },
        options: {
          cutout: "68%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} jobs`,
              },
            },
          },
        },
      });
    } else if (typeCtx) {
      typeCtx.parentElement.innerHTML = "<p style='color:var(--text-muted);text-align:center;padding:40px 0'>No job data yet</p>";
    }

    // ── 3. Resumes Over Time — Line ───────────────────────
    const timeCtx = document.getElementById("chart-resumes-time");
    if (timeCtx) {
      const labels = d.resumes_over_time.map(r => {
        const dt = new Date(r.date);
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      });
      const counts = d.resumes_over_time.map(r => r.count);

      new Chart(timeCtx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Resumes",
            data: counts,
            borderColor:          COLORS.teal,
            backgroundColor:      "rgba(26,188,156,0.12)",
            pointBackgroundColor: COLORS.teal,
            pointRadius:          4,
            pointHoverRadius:     7,
            fill:        true,
            tension:     0.4,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid:  { color: "rgba(42,42,74,0.5)" },
              ticks: { maxTicksLimit: 10 },
            },
            y: {
              grid:  { color: "rgba(42,42,74,0.5)" },
              ticks: { stepSize: 1, precision: 0 },
              beginAtZero: true,
            },
          },
        },
      });

      if (!d.resumes_over_time.length) {
        timeCtx.parentElement.innerHTML = "<p style='color:var(--text-muted);text-align:center;padding:40px 0'>No upload data in the last 30 days</p>";
      }
    }

    // ── 4. Top Skills — Horizontal Bar ───────────────────
    const skillCtx = document.getElementById("chart-top-skills");
    if (skillCtx && d.top_skills.length) {
      const skillLabels  = d.top_skills.map(s => s.skill);
      const skillCounts  = d.top_skills.map(s => s.count);
      const skillColors  = skillCounts.map(c => {
        const max = skillCounts[0] || 1;
        const ratio = c / max;
        if (ratio > 0.66)  return "rgba(233,69,96,0.85)";
        if (ratio > 0.33)  return "rgba(243,156,18,0.75)";
        return "rgba(52,152,219,0.75)";
      });

      new Chart(skillCtx, {
        type: "bar",
        data: {
          labels: skillLabels,
          datasets: [{
            label: "Occurrences",
            data:            skillCounts,
            backgroundColor: skillColors,
            borderColor:     skillColors.map(c => c.replace("0.85", "1").replace("0.75", "1")),
            borderWidth:  1,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid:  { color: "rgba(42,42,74,0.5)" },
              ticks: { stepSize: 1, precision: 0 },
              beginAtZero: true,
            },
            y: { grid: { display: false } },
          },
        },
      });
    } else if (skillCtx) {
      skillCtx.parentElement.innerHTML = "<p style='color:var(--text-muted);text-align:center;padding:40px 0'>No skill data yet</p>";
    }

  } catch (err) {
    console.error("[Charts] Failed to load chart data:", err);
  }
}
