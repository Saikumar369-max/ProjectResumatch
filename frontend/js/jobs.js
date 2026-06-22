// ── Jobs Page Logic ──────────────────────────────────────
let allJobs = [];
let deleteTargetId = null;
let uploadTargetJobId = null;
let uploadTargetJobTitle = null;
let uploadedFiles = [];

// ── Init ─────────────────────────────────────────────────
async function initJobsPage() {
  if (!requireAuth()) return;

  // Show user name in nav
  const user = getUser();
  if (user) {
    document.getElementById("nav-user-name").textContent = user.name;
  }

  await loadJobs();
}

// ── Load Jobs from API ───────────────────────────────────
async function loadJobs() {
  const loading = document.getElementById("jobs-loading");
  const grid = document.getElementById("jobs-grid");
  const empty = document.getElementById("empty-state");

  loading.classList.remove("hidden");
  grid.classList.add("hidden");
  empty.classList.add("hidden");

  try {
    const res = await fetch(`${API_URL}/jobs`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) {
      if (res.status === 401) { logout(); return; }
      showToast("Failed to load jobs");
      return;
    }

    const data = await res.json();
    allJobs = data.jobs;
    renderJobs();
  } catch (err) {
    showToast("Cannot connect to server. Is the backend running?");
  } finally {
    loading.classList.add("hidden");
  }
}

// ── Render Jobs ──────────────────────────────────────────
function renderJobs() {
  const grid = document.getElementById("jobs-grid");
  const empty = document.getElementById("empty-state");
  const badge = document.getElementById("job-count-badge");

  badge.textContent = allJobs.length;

  if (allJobs.length === 0) {
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.classList.remove("hidden");

  grid.innerHTML = allJobs
    .map((job) => {
      const date = new Date(job.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const hasResumes = job.resume_count && job.resume_count > 0;

      // Build the button: "View Results" if already uploaded, otherwise "Upload Resumes"
      let actionBtn;
      if (hasResumes) {
        actionBtn = `
          <button class="btn-view-results" onclick="openUploadPage('${job._id}', '${escapeHtml(job.title)}', true)" title="View scored results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            View Results <span class="resume-count-chip">${job.resume_count}</span>
          </button>`;
      } else {
        actionBtn = `
          <button class="btn-upload-resume" onclick="openUploadPage('${job._id}', '${escapeHtml(job.title)}', false)" title="Upload resumes for this job">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Resumes
          </button>`;
      }

      return `
      <div class="job-card" data-id="${job._id}">
        <div class="job-card-top">
          <span class="job-type-badge">${escapeHtml(job.type)}</span>
          <button class="job-action-btn delete-btn" onclick="openDeleteModal('${job._id}', '${escapeHtml(job.title)}')" title="Delete job" aria-label="Delete ${escapeHtml(job.title)}">
            🗑
          </button>
        </div>
        <h3 class="job-card-title">${escapeHtml(job.title)}</h3>
        <div class="job-card-meta">
          ${job.department ? `<span class="meta-item">🏢 ${escapeHtml(job.department)}</span>` : ""}
          ${job.location ? `<span class="meta-item">📍 ${escapeHtml(job.location)}</span>` : ""}
        </div>
        ${job.description ? `<p class="job-card-desc">${escapeHtml(job.description).substring(0, 120)}${job.description.length > 120 ? "…" : ""}</p>` : ""}
        <div class="job-card-footer">
          <span class="job-date">Created ${date}</span>
          ${actionBtn}
        </div>
      </div>`;
    })
    .join("");
}

// ── Create Job ───────────────────────────────────────────
function openCreateModal() {
  document.getElementById("create-job-form").reset();
  document.getElementById("create-modal").classList.remove("hidden");
  document.getElementById("job-title").focus();
}

function closeCreateModal() {
  document.getElementById("create-modal").classList.add("hidden");
}

async function handleCreateJob(e) {
  e.preventDefault();
  const btn = document.getElementById("create-job-btn");
  const originalText = btn.textContent;

  const payload = {
    title: document.getElementById("job-title").value.trim(),
    department: document.getElementById("job-department").value.trim(),
    location: document.getElementById("job-location").value.trim(),
    type: document.getElementById("job-type").value,
    status: "open",
    description: document.getElementById("job-description").value.trim(),
    requirements: document.getElementById("job-requirements").value.trim(),
  };

  if (!payload.title) {
    showToast("Job title is required");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Creating...';

  try {
    const res = await fetch(`${API_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Failed to create job");
      return;
    }

    showToast("Job created successfully!", "success");
    closeCreateModal();
    await loadJobs();
  } catch (err) {
    showToast("Cannot connect to server");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Delete Job ───────────────────────────────────────────
function openDeleteModal(id, title) {
  deleteTargetId = id;
  document.getElementById("delete-job-title").textContent = title;
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
  deleteTargetId = null;
}

async function confirmDelete() {
  if (!deleteTargetId) return;

  const btn = document.getElementById("confirm-delete-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Deleting...';

  try {
    const res = await fetch(`${API_URL}/jobs/${deleteTargetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to delete job");
      return;
    }

    showToast("Job deleted", "success");
    closeDeleteModal();
    await loadJobs();
  } catch (err) {
    showToast("Cannot connect to server");
  } finally {
    btn.disabled = false;
    btn.textContent = "Delete";
  }
}

// ── Helpers ──────────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Upload Page Navigation ───────────────────────────────
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ALLOWED_EXTS = [".pdf", ".doc", ".docx"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function openUploadPage(jobId, jobTitle, showResults) {
  uploadTargetJobId = jobId;
  uploadTargetJobTitle = jobTitle;
  uploadedFiles = [];
  renderUploadedFiles();

  // Switch views
  document.getElementById("jobs-list-view").classList.add("hidden");
  document.getElementById("upload-page-view").classList.remove("hidden");

  // Set job name
  document.getElementById("upload-job-name").textContent = jobTitle;

  // Reset all steps
  document.getElementById("upload-step-dropzone").classList.remove("hidden");
  document.getElementById("upload-progress-area").classList.add("hidden");
  document.getElementById("results-area").classList.add("hidden");

  // Reset progress bar
  document.getElementById("upload-progress-bar").style.width = "0%";
  document.getElementById("upload-progress-text").textContent = "Uploading & parsing… 0%";

  if (showResults) {
    // If job already has results, load them directly
    document.getElementById("upload-page-title").textContent = "Resume Results";
    document.getElementById("upload-step-dropzone").classList.add("hidden");
    document.getElementById("btn-delete-job-page").classList.remove("hidden");
    loadExistingResults();
  } else {
    document.getElementById("upload-page-title").textContent = "Upload & Score Resumes";
    document.getElementById("upload-step-dropzone").classList.remove("hidden");
    document.getElementById("btn-delete-job-page").classList.add("hidden");
  }
}

function backToJobs() {
  document.getElementById("upload-page-view").classList.add("hidden");
  document.getElementById("jobs-list-view").classList.remove("hidden");
  document.getElementById("btn-delete-job-page").classList.add("hidden");
  uploadTargetJobId = null;
  uploadTargetJobTitle = null;
  uploadedFiles = [];
  // Refresh jobs to update resume counts
  loadJobs();
}

// ── Load Existing Results from DB ────────────────────────
async function loadExistingResults() {
  const resultsArea = document.getElementById("results-area");

  try {
    const res = await fetch(`${API_URL}/jobs/${uploadTargetJobId}/resumes`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to load results");
      return;
    }

    const data = await res.json();
    renderResultsTable(data.resumes);
    resultsArea.classList.remove("hidden");
  } catch (err) {
    showToast("Cannot connect to server");
  }
}

// ── File Handling ────────────────────────────────────────

function validateFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return `"${file.name}" is not a supported format. Use PDF, DOC, or DOCX.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" exceeds the 10 MB limit.`;
  }
  return null;
}

function addFiles(fileList) {
  const errors = [];
  for (const file of fileList) {
    const err = validateFile(file);
    if (err) {
      errors.push(err);
      continue;
    }
    // Skip duplicates
    if (uploadedFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
    uploadedFiles.push(file);
  }
  if (errors.length) showToast(errors[0]);
  renderUploadedFiles();
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderUploadedFiles();
}

function renderUploadedFiles() {
  const list = document.getElementById("upload-file-list");
  const submitBtn = document.getElementById("submit-upload-btn");

  if (uploadedFiles.length === 0) {
    list.innerHTML = "";
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
  list.innerHTML = uploadedFiles
    .map((f, i) => {
      const sizeKB = (f.size / 1024).toFixed(1);
      const ext = f.name.split(".").pop().toUpperCase();
      const icon = ext === "PDF" ? "📕" : "📘";
      return `
        <div class="upload-file-item" style="animation-delay: ${i * 0.05}s">
          <div class="upload-file-icon">${icon}</div>
          <div class="upload-file-info">
            <span class="upload-file-name">${escapeHtml(f.name)}</span>
            <span class="upload-file-meta">${ext} · ${sizeKB} KB</span>
          </div>
          <button class="upload-file-remove" onclick="removeFile(${i})" title="Remove file" aria-label="Remove ${escapeHtml(f.name)}">✕</button>
        </div>`;
    })
    .join("");
}

function handleUploadDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById("upload-dropzone");
  dz.classList.remove("drag-over");
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
}

function handleUploadDragOver(e) {
  e.preventDefault();
  document.getElementById("upload-dropzone").classList.add("drag-over");
}

function handleUploadDragLeave(e) {
  e.preventDefault();
  document.getElementById("upload-dropzone").classList.remove("drag-over");
}

function triggerFileInput() {
  document.getElementById("resume-file-input").click();
}

function handleFileInputChange(e) {
  if (e.target.files.length) addFiles(e.target.files);
  e.target.value = ""; // reset so same file can be re-selected
}

// ── Upload Resumes & Immediately Show Scores ─────────────
async function uploadResumes() {
  if (uploadedFiles.length === 0) return;

  const progressArea = document.getElementById("upload-progress-area");
  const progressBar = document.getElementById("upload-progress-bar");
  const progressText = document.getElementById("upload-progress-text");
  const actionsArea = document.getElementById("upload-actions");
  const dropzoneStep = document.getElementById("upload-step-dropzone");

  // Hide dropzone, show progress
  dropzoneStep.classList.add("hidden");
  progressArea.classList.remove("hidden");

  // Animate progress bar while uploading
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 8 + 2;
    if (progress > 85) progress = 85; // Cap at 85% until real response
    progressBar.style.width = progress + "%";
    progressText.textContent = `Uploading & scoring… ${Math.round(progress)}%`;
  }, 300);

  // Build FormData
  const formData = new FormData();
  for (const file of uploadedFiles) {
    formData.append("resumes", file);
  }

  try {
    const res = await fetch(`${API_URL}/jobs/${uploadTargetJobId}/resumes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    clearInterval(progressInterval);

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to upload resumes");
      // Reset back to dropzone
      progressArea.classList.add("hidden");
      dropzoneStep.classList.remove("hidden");
      progressBar.style.width = "0%";
      return;
    }

    // Complete progress
    progressBar.style.width = "100%";
    progressText.textContent = "Processing complete!";

    const data = await res.json();
    const totalFiles = data.count || uploadedFiles.length;
    const resumes = data.resumes || [];

    showToast(`${totalFiles} resume${totalFiles > 1 ? "s" : ""} uploaded & scored!`, "success");

    // Short delay then show results
    setTimeout(() => {
      progressArea.classList.add("hidden");
      document.getElementById("upload-page-title").textContent = "Resume Results";
      document.getElementById("btn-delete-job-page").classList.remove("hidden");
      renderResultsTable(resumes);
      document.getElementById("results-area").classList.remove("hidden");
    }, 600);

  } catch (err) {
    clearInterval(progressInterval);
    showToast("Cannot connect to server. Is the backend running?");
    progressArea.classList.add("hidden");
    dropzoneStep.classList.remove("hidden");
    progressBar.style.width = "0%";
  }
}

// ── Render Results Table ─────────────────────────────────
function renderResultsTable(resumes) {
  const tbody = document.getElementById("results-tbody");
  const countEl = document.getElementById("results-count");

  countEl.textContent = `${resumes.length} candidate${resumes.length !== 1 ? "s" : ""}`;

  if (resumes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted)">No resumes found</td></tr>`;
    return;
  }

  tbody.innerHTML = resumes
    .map((r, i) => {
      const rank = i + 1;
      const score = r.match_score;
      let scoreClass = "score-low";
      if (score >= 70) scoreClass = "score-high";
      else if (score >= 40) scoreClass = "score-mid";

      // Rank badge
      let rankBadge = `<span class="rank-badge">${rank}</span>`;
      if (rank === 1) rankBadge = `<span class="rank-badge rank-gold">🥇 ${rank}</span>`;
      else if (rank === 2) rankBadge = `<span class="rank-badge rank-silver">🥈 ${rank}</span>`;
      else if (rank === 3) rankBadge = `<span class="rank-badge rank-bronze">🥉 ${rank}</span>`;

      // Truncate skills for display
      const skills = r.skills || "N/A";
      const skillsDisplay = skills.length > 50 ? skills.substring(0, 50) + "…" : skills;

      return `
        <tr class="result-row" style="animation-delay: ${i * 0.05}s">
          <td>${rankBadge}</td>
          <td><code class="resume-id-badge">${escapeHtml(r.resume_id)}</code></td>
          <td class="td-name">${escapeHtml(r.name)}</td>
          <td class="td-email">${escapeHtml(r.email)}</td>
          <td class="td-skills" title="${escapeHtml(skills)}">${escapeHtml(skillsDisplay)}</td>
          <td><span class="score-badge ${scoreClass}">${score}%</span></td>
        </tr>`;
    })
    .join("");
}

// ── Delete Job from Results Page ─────────────────────────
async function deleteJobFromPage() {
  if (!uploadTargetJobId) return;

  const btn = document.getElementById("btn-delete-job-page");
  const confirmed = confirm(`Delete "${uploadTargetJobTitle}" and all its scored resumes? This cannot be undone.`);
  if (!confirmed) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Deleting...';

  try {
    const res = await fetch(`${API_URL}/jobs/${uploadTargetJobId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to delete job");
      return;
    }

    showToast("Job and all results deleted", "success");
    backToJobs();
  } catch (err) {
    showToast("Cannot connect to server");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete Job & Results`;
  }
}

// Close modals on backdrop click
document.addEventListener("click", (e) => {
  if (e.target.id === "create-modal") closeCreateModal();
  if (e.target.id === "delete-modal") closeDeleteModal();
});

// Close modals on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeCreateModal();
    closeDeleteModal();
  }
});
