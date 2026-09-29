import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = "resumatch_db"
JWT_SECRET = os.environ.get("JWT_SECRET", "resumatch-super-secret-key-2026")
JWT_EXPIRY_HOURS = 24
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = "openai/gpt-oss-120b"
