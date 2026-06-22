from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
import bcrypt
import jwt
import datetime
import re
import io
import os
import json
import random
from functools import wraps
from PyPDF2 import PdfReader
from docx import Document
from groq import Groq
from config import MONGO_URI, DB_NAME, JWT_SECRET, JWT_EXPIRY_HOURS, GROQ_API_KEY, GROQ_MODEL

# ── App Setup ──────────────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

# ── Groq Client ────────────────────────────────────────────
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# ── Serve Frontend ─────────────────────────────────────────
@app.route('/')
def serve_index():
    return app.send_static_file('index.html')


@app.route('/<path:filename>')
def serve_frontend(filename):
    return app.send_static_file(filename)

# ── MongoDB Setup ──────────────────────────────────────────
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
users_col = db["users"]

# Create unique index on email
users_col.create_index("email", unique=True)


# ── JWT Decorator ──────────────────────────────────────────
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            current_user = users_col.find_one({"_id": ObjectId(data["user_id"])})
            if not current_user:
                return jsonify({"error": "User not found"}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        return f(current_user, *args, **kwargs)
    return decorated


# ── Helper: Generate JWT ───────────────────────────────────
def generate_token(user_id):
    payload = {
        "user_id": str(user_id),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ── Routes ─────────────────────────────────────────────────

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json()

    # Validate input
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "recruiter")

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Check if email already exists
    if users_col.find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    # Hash password and insert
    hashed_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

    user = {
        "name": name,
        "email": email,
        "password": hashed_pw.decode("utf-8"),
        "role": role,
        "created_at": datetime.datetime.utcnow()
    }

    result = users_col.insert_one(user)
    token = generate_token(result.inserted_id)

    return jsonify({
        "message": "Account created successfully",
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "name": name,
            "email": email,
            "role": role
        }
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Find user
    user = users_col.find_one({"email": email})
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    # Check password
    if not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    token = generate_token(user["_id"])

    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    }), 200


@app.route("/api/me", methods=["GET"])
@token_required
def get_profile(current_user):
    return jsonify({
        "user": {
            "id": str(current_user["_id"]),
            "name": current_user["name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "created_at": current_user["created_at"].isoformat()
        }
    }), 200


# ── Jobs Collection ────────────────────────────────────────
jobs_col = db["jobs"]
jobs_col.create_index("created_by")


@app.route("/api/jobs", methods=["POST"])
@token_required
def create_job(current_user):
    data = request.get_json()

    title = data.get("title", "").strip()
    department = data.get("department", "").strip()
    location = data.get("location", "").strip()
    job_type = data.get("type", "Full-time")
    description = data.get("description", "").strip()
    requirements = data.get("requirements", "").strip()
    status = data.get("status", "open")

    if not title:
        return jsonify({"error": "Job title is required"}), 400

    job = {
        "title": title,
        "department": department,
        "location": location,
        "type": job_type,
        "description": description,
        "requirements": requirements,
        "status": status,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.datetime.utcnow(),
        "updated_at": datetime.datetime.utcnow()
    }

    result = jobs_col.insert_one(job)

    job["_id"] = str(result.inserted_id)
    job["created_at"] = job["created_at"].isoformat()
    job["updated_at"] = job["updated_at"].isoformat()

    return jsonify({"message": "Job created successfully", "job": job}), 201


@app.route("/api/jobs", methods=["GET"])
@token_required
def list_jobs(current_user):
    query = {"created_by": str(current_user["_id"])}

    jobs = list(jobs_col.find(query).sort("created_at", -1))

    for job in jobs:
        job["_id"] = str(job["_id"])
        job["created_at"] = job["created_at"].isoformat()
        job["updated_at"] = job["updated_at"].isoformat()
        # Include resume count so frontend knows if results exist
        job["resume_count"] = resumes_col.count_documents({"job_id": job["_id"]})

    return jsonify({"jobs": jobs, "count": len(jobs)}), 200


@app.route("/api/jobs/<job_id>", methods=["GET"])
@token_required
def get_job(current_user, job_id):
    try:
        job = jobs_col.find_one({"_id": ObjectId(job_id), "created_by": str(current_user["_id"])})
    except Exception:
        return jsonify({"error": "Invalid job ID"}), 400

    if not job:
        return jsonify({"error": "Job not found"}), 404

    job["_id"] = str(job["_id"])
    job["created_at"] = job["created_at"].isoformat()
    job["updated_at"] = job["updated_at"].isoformat()

    return jsonify({"job": job}), 200


@app.route("/api/jobs/<job_id>", methods=["DELETE"])
@token_required
def delete_job(current_user, job_id):
    try:
        result = jobs_col.delete_one({"_id": ObjectId(job_id), "created_by": str(current_user["_id"])})
    except Exception:
        return jsonify({"error": "Invalid job ID"}), 400

    if result.deleted_count == 0:
        return jsonify({"error": "Job not found"}), 404

    # Also delete all resumes associated with this job
    resumes_col.delete_many({"job_id": job_id})

    return jsonify({"message": "Job and all associated resumes deleted successfully"}), 200


# ── Resumes Collection ─────────────────────────────────────
resumes_col = db["resumes"]
resumes_col.create_index("job_id")
resumes_col.create_index("resume_id", unique=True)


# ── Resume Parsing Helpers ─────────────────────────────────
def extract_text_from_pdf(file_bytes):
    """Extract text content from a PDF file."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception:
        return ""


def extract_text_from_docx(file_bytes):
    """Extract text content from a DOCX file."""
    try:
        doc = Document(io.BytesIO(file_bytes))
        text = "\n".join([p.text for p in doc.paragraphs])
        return text.strip()
    except Exception:
        return ""


def extract_email(text):
    """Extract the first email address found in text."""
    match = re.search(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text)
    return match.group(0) if match else "N/A"


def extract_name(text):
    """Extract candidate name using heuristic: first non-empty line that looks like a name."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines[:5]:  # Check first 5 lines
        # Skip lines that look like emails, phones, URLs, or are too long
        if "@" in line or "http" in line:
            continue
        if re.search(r'\d{5,}', line):  # Skip lines with long numbers (phone/zip)
            continue
        if len(line) > 60:  # Names are usually short
            continue
        # Check if it looks like a name (mostly letters and spaces)
        clean = re.sub(r'[^a-zA-Z\s]', '', line).strip()
        if clean and len(clean.split()) >= 1 and len(clean.split()) <= 5:
            return clean.title()
    return "Unknown"


def generate_resume_id():
    """Generate a unique 4-digit resume ID."""
    while True:
        rid = str(random.randint(1000, 9999))
        if not resumes_col.find_one({"resume_id": rid}):
            return rid


# ── GROQ LLM Scoring ──────────────────────────────────────
def score_resumes_with_llm(parsed_resumes, job_title, job_description, job_requirements):
    """
    Send all parsed resume data to Groq LLM for intelligent scoring.
    Each resume in parsed_resumes is a dict with: name, email, resume_text
    Returns a list of dicts with: name, email, skills, match_score, reasoning
    """
    if not groq_client:
        raise ValueError("GROQ_API_KEY is not configured. Please set it in your .env file.")

    # Build resume summaries for the prompt (limit text to avoid token overflow)
    resume_entries = []
    for i, r in enumerate(parsed_resumes):
        truncated_text = r["resume_text"][:3000]  # Cap at 3000 chars per resume
        resume_entries.append(
            f"--- RESUME {i + 1} ---\n"
            f"Candidate Name: {r['name']}\n"
            f"Email: {r['email']}\n"
            f"Resume Content:\n{truncated_text}\n"
        )

    all_resumes_text = "\n".join(resume_entries)

    # Default prompt sent every time
    system_prompt = """You are an expert AI recruiter and resume screening specialist. Your job is to analyze resumes against a job posting and provide accurate scoring.

For each resume, you must:
1. Extract ALL technical skills, tools, frameworks, programming languages, soft skills, certifications, and domain expertise found in the resume.
2. Evaluate how well the candidate matches the job requirements considering:
   - Skills alignment (technical and soft skills)
   - Experience relevance
   - Education fit
   - Overall suitability for the role
3. Assign a match_score from 0 to 100 where:
   - 90-100: Exceptional match, candidate exceeds requirements
   - 70-89: Strong match, candidate meets most requirements
   - 50-69: Moderate match, candidate has some relevant qualifications
   - 30-49: Weak match, candidate lacks key requirements
   - 0-29: Poor match, candidate is not suitable

You MUST respond with ONLY a valid JSON array. No explanations, no markdown, no code blocks.
Each element must have exactly these fields:
- "resume_index": (integer, 0-based index of the resume)
- "skills": (string, comma-separated list of ALL skills found)
- "match_score": (integer, 0-100)

Example response format:
[{"resume_index": 0, "skills": "Python, React, SQL, Docker, AWS, Communication", "match_score": 78}]"""

    user_prompt = f"""Analyze the following resumes against this job posting and score each one.

=== JOB POSTING ===
Title: {job_title}
Description: {job_description}
Requirements: {job_requirements}

=== RESUMES TO SCORE ===
{all_resumes_text}

Return a JSON array with one entry per resume. Remember: respond with ONLY the JSON array, nothing else."""

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=GROQ_MODEL,
            temperature=0.1,  # Low temp for consistent scoring
            max_tokens=4096,
            top_p=1,
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Clean response - remove markdown code blocks if present
        if response_text.startswith("```"):
            # Remove ```json and ``` wrappers
            response_text = re.sub(r'^```(?:json)?\s*', '', response_text)
            response_text = re.sub(r'\s*```$', '', response_text)

        scored_data = json.loads(response_text)

        # Validate and map back
        results = []
        for entry in scored_data:
            idx = entry.get("resume_index", 0)
            if 0 <= idx < len(parsed_resumes):
                results.append({
                    "resume_index": idx,
                    "skills": entry.get("skills", "N/A"),
                    "match_score": max(0, min(100, int(entry.get("match_score", 50)))),
                })

        return results

    except json.JSONDecodeError as e:
        print(f"[GROQ] Failed to parse JSON response: {e}")
        print(f"[GROQ] Raw response: {response_text[:500]}")
        # Fallback: return empty skills with neutral scores
        return [
            {"resume_index": i, "skills": "N/A", "match_score": 50}
            for i in range(len(parsed_resumes))
        ]
    except Exception as e:
        print(f"[GROQ] API error: {e}")
        raise


# ── Resume Upload & Score Endpoint ─────────────────────────
@app.route("/api/jobs/<job_id>/resumes", methods=["POST"])
@token_required
def upload_resumes(current_user, job_id):
    """Upload, parse, and score multiple resumes for a job using Groq LLM."""
    # Verify job exists and belongs to user
    try:
        job = jobs_col.find_one({"_id": ObjectId(job_id), "created_by": str(current_user["_id"])})
    except Exception:
        return jsonify({"error": "Invalid job ID"}), 400

    if not job:
        return jsonify({"error": "Job not found"}), 404

    if not groq_client:
        return jsonify({"error": "GROQ_API_KEY is not configured. Please add it to your .env file."}), 500

    files = request.files.getlist("resumes")
    if not files:
        return jsonify({"error": "No resume files provided"}), 400

    job_title = job.get("title", "")
    job_desc = job.get("description", "")
    job_reqs = job.get("requirements", "")

    # Step 1: Parse all resumes and extract text
    parsed_resumes = []

    for f in files:
        filename = f.filename.lower()
        file_bytes = f.read()

        # Extract text based on file type
        if filename.endswith(".pdf"):
            text = extract_text_from_pdf(file_bytes)
        elif filename.endswith(".docx"):
            text = extract_text_from_docx(file_bytes)
        elif filename.endswith(".doc"):
            text = file_bytes.decode("utf-8", errors="ignore")
        else:
            continue  # Skip unsupported files

        if not text:
            text = f.filename  # Fallback

        name = extract_name(text)
        email = extract_email(text)

        parsed_resumes.append({
            "name": name,
            "email": email,
            "resume_text": text,
        })

    if not parsed_resumes:
        return jsonify({"error": "No valid resume files found"}), 400

    # Step 2: Send all resumes to Groq LLM for scoring
    try:
        llm_results = score_resumes_with_llm(parsed_resumes, job_title, job_desc, job_reqs)
    except Exception as e:
        return jsonify({"error": f"LLM scoring failed: {str(e)}"}), 500

    # Step 3: Merge LLM results with parsed data and save to DB
    results = []

    for llm_entry in llm_results:
        idx = llm_entry["resume_index"]
        if idx >= len(parsed_resumes):
            continue

        parsed = parsed_resumes[idx]
        resume_id = generate_resume_id()

        resume_doc = {
            "resume_id": resume_id,
            "job_id": job_id,
            "name": parsed["name"],
            "email": parsed["email"],
            "skills": llm_entry.get("skills", "N/A"),
            "match_score": llm_entry.get("match_score", 50),
            "created_at": datetime.datetime.utcnow()
        }

        resumes_col.insert_one(resume_doc)
        resume_doc["_id"] = str(resume_doc["_id"])
        resume_doc["created_at"] = resume_doc["created_at"].isoformat()
        results.append(resume_doc)

    # Sort by score descending
    results.sort(key=lambda r: r["match_score"], reverse=True)

    return jsonify({"resumes": results, "count": len(results)}), 201


@app.route("/api/jobs/<job_id>/resumes", methods=["GET"])
@token_required
def get_resumes(current_user, job_id):
    """Get all scored resumes for a job, sorted by match_score."""
    # Verify job belongs to user
    try:
        job = jobs_col.find_one({"_id": ObjectId(job_id), "created_by": str(current_user["_id"])})
    except Exception:
        return jsonify({"error": "Invalid job ID"}), 400

    if not job:
        return jsonify({"error": "Job not found"}), 404

    resumes = list(resumes_col.find({"job_id": job_id}).sort("match_score", -1))

    for r in resumes:
        r["_id"] = str(r["_id"])
        r["created_at"] = r["created_at"].isoformat()

    return jsonify({"resumes": resumes, "count": len(resumes)}), 200


# ── Run ────────────────────────────────────────────────────
if __name__ == "__main__":
    if not GROQ_API_KEY:
        print("[WARNING] GROQ_API_KEY not set in .env -- LLM scoring will not work!")
    else:
        print(f"[OK] Groq LLM configured: {GROQ_MODEL}")
    print("ResuMatch API running on http://localhost:5000")
    app.run(debug=True, port=5000)
