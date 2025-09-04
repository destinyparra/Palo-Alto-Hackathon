from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from datetime import datetime, timedelta
from dotenv import load_dotenv
from collections import Counter
import os
import logging
import traceback


# analysis helpers
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from textblob import TextBlob
import re

# dev testing
from flask import send_from_directory, redirect, url_for





# Read environment variables from .env file
load_dotenv()

# Logging setup for debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



app = Flask(__name__)
CORS(app)

app.config['MONGO_URI'] = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/Palo-Alto-Hackathon')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'change-me')

# Initialize 
mongo = PyMongo(app)
vader = SentimentIntensityAnalyzer()

# Theme Categories
THEME_CATEGORIES = {
    "work": ["work", "job", "boss", "project", "meeting", "deadline", "office", "colleague", 
             "career", "professional", "business", "client", "salary", "promotion", "corporate"],
    "health": ["health", "run", "gym", "workout", "sleep", "tired", "doctor", "exercise", 
               "fitness", "nutrition", "wellness", "medical", "therapy", "healing"],
    "friends": ["friend", "hang", "party", "buddy", "social", "chat", "call", "text", 
                "friendship", "companion", "peer", "acquaintance"],
    "family": ["family", "mom", "dad", "parent", "kids", "home", "sibling", "mother", 
               "father", "child", "son", "daughter", "relatives", "grandparent"],
    "stress": ["stress", "overwhelmed", "anxious", "worry", "pressure", "tension", 
               "burnout", "exhausted", "frustrated", "struggle"],
    "happiness": ["happy", "joy", "excited", "grateful", "smile", "laugh", "celebrate", 
                  "wonderful", "amazing", "blessed", "content", "cheerful"],
    "love": ["love", "relationship", "romance", "dating", "partner", "boyfriend", 
             "girlfriend", "heart", "affection", "intimate"],
    "creativity": ["creative", "art", "music", "write", "design", "paint", "draw", 
                   "inspiration", "artistic", "imagination"],
    "learning": ["learn", "study", "read", "book", "education", "knowledge", "skill", 
                 "course", "research", "discovery"],
    "travel": ["travel", "trip", "vacation", "explore", "journey", "adventure", 
               "destination", "flight", "hotel"]
}

# Journal Prompts - for inspiration 
# Future enhancement: serve random prompt via API
WRITING_PROMPTS = [
    "What are three things that went well today?",
    "What made you smile recently?",
    "Describe a good conversation you had.",
    "What is something new you learned?",
    "What good deed did you do for someone else?",
    "What is a long-term goal you are working towards?",
    "What is a recent accomplishment you are proud of?",
    "What challenged you recently, and how did you handle it?",
    "Describe a moment when you felt truly present.",
    "What are you grateful for right now?",
    "How have you grown in the past week?",
    "What would you tell your past self about today?",
    "What patterns do you notice in your thoughts lately?",
    "Describe someone who made your day better.",
    "What small victory can you celebrate today?",
    "How are you taking care of yourself?"
]

# Validation 
def validate_user_input(data):
    errors = []

    if not isinstance(data, dict):
        errors.append("Invalid data format.")
        return errors, {}
    
    # validate text
    text = data.get("text", "").strip()
    if not text:
        errors.append("Text is required.")
    elif len(text) < 3:
        errors.append("Text is too short, must exceed 3 characters.")
    elif len(text) > 10000:
        errors.append("Text is too long, must be under 10,000 characters.")
    
    # validate userId
    user_id = data.get("userId", "default_user").strip()
    if len(user_id) > 100:
        errors.append("userId is too long, must be under 100 characters.")

    # Sanitize text basic XSS protection - might change later to smth stronger than just regex stripping
    text = re.sub(r'<[^>]+>', '', text)  # Remove HTML tags
    
    return errors, {"text": text, "userId": user_id}


# Error Handlers
@app.errorhandler(400)
def bad_request(error):
    return jsonify({"error": "Bad Request", "message": str(error)}), 400

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({"error": "Internal Server Error"}), 500



# Health Check
@app.route('/healthz')
def health():
    try:
        # Simple DB check
        mongo.db.command('ping')
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected",
            "version": "1.0.0"
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }), 503

# Dev route
@app.route('/dev')
def dev():
    return send_from_directory('static', 'dev.html')

# 404 on '/' redirects to /dev
@app.route('/')
def root():
    return redirect(url_for('dev'))
 


# Creating journal entry (text only for now)
@app.route("/api/entries", methods=["POST"])
def create_entry():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    user_id = data.get("userId", "default_user")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    analysis = analyze_sentiment(text)
    doc = {
        "userId": user_id,
        "text": text,
        "createdAt": datetime.utcnow(),
        "sentiment": analysis["sentiment"],
        "emotion": analysis["emotion"],
        "summary": summarize(text),
        "themes": extract_themes(text),

    }
    result = mongo.db.entries.insert_one(doc)

    # Convert ObjectId to string for JSON serialization
    doc["_id"] = str(result.inserted_id)
    doc["createdAt"] = doc["createdAt"].isoformat()
    return jsonify(doc), 201

# Fetching journal entries
@app.route("/api/entries", methods=["GET"])
def get_entries():
    user_id = request.args.get("userId", "default_user")
    items = list(
        mongo.db.entries.find({"userId": user_id})
        .sort("createdAt", -1)
        .limit(50)
    )
    
    for item in items:
        item["_id"] = str(item["_id"])
        created = item.get("createdAt")
        if hasattr(created, "isoformat"):
            item["createdAt"] = item["createdAt"].isoformat()
    return jsonify(items), 200


@app.route("/api/insights", methods=["GET"])
def get_insights():
    user_id = request.args.get("userId", "default_user")
    period = request.args.get("period", "weekly") #weekly or monthly
    end_date = datetime.utcnow()
    start_date = end_date - (timedelta(days=7) if period == "weekly" else timedelta(days=30))

    items = list(mongo.db.entries.find({
        "userId": user_id,
        "createdAt": {"$gte": start_date, "$lte": end_date}
    }))

    if not items:
            return jsonify({
                "userId": user_id,
                "entryCount": 0,
                "avgSentiment": 0,
                "topThemes": [],
                "themeCounts": {},
                "startDate": start_date.isoformat(),
                "endDate": end_date.isoformat(),
                "period": period
            }), 200
    
    sentiments = [e.get("sentiment", 0) for e in items]
    avg_sentiment = sum(sentiments) / len(sentiments)

    all_themes = []
    for e in items:
        if isinstance(e.get("themes"), list):
            all_themes.extend(e.get("themes"))
    counts = Counter(all_themes)
    top3 = [k for k, _ in counts.most_common(3)]

    return jsonify({
        "userId": user_id,
        "entryCount": len(items),
        "avgSentiment": avg_sentiment,
        "topThemes": top3,
        "themeCounts": dict(counts),
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "period": period
    }), 200

@app.route("/api/garden", methods=["GET"])
def get_garden():
    user_id = request.args.get("userId", "default_user")

    pipeline = [
        {"$match": {"userId": user_id}},
        {"$unwind": {"path": "$themes", "preserveNullAndEmptyArrays": False}},
        {"$group": {"_id": "$themes", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]

    theme_data = list(mongo.db.entries.aggregate(pipeline))

    def stage_for(count: int) -> str:
        if count >= 10:
            return "blooming"
        elif count >= 5:
            return "growing"
        elif count >= 2:
            return "sprouting"
        return "seedling"
        
    # map to objects
    garden = []
    for row in theme_data:
        theme = row["_id"]
        count = row["count"]
        garden.append({
            "theme": theme,
            "count": count,
            "stage": stage_for(count)
        })

    return jsonify(garden), 200


def analyze_sentiment(text: str):
    scores = vader.polarity_scores(text)
    v = scores.get('compound', 0.0)  # <- correct key + safe default
    b = TextBlob(text).sentiment.polarity
    score = 0.6 * v + 0.4 * b
    emotion = (
        "very_positive" if score >= 0.5 else
        "positive"       if score >= 0.1 else
        "neutral"        if score >  -0.1 else
        "negative"       if score >  -0.5 else
        "very_negative"
    )
    return {"sentiment": score, "emotion": emotion}


def summarize(text: str) -> str:
    parts = [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 10]
    if not parts:
        return (text[:100] + "...") if len(text) > 100 else text
    if len(parts) == 1:
        return parts[0]
    # take the first two decent sentences
    return ". ".join(parts[:2]) + "."

def extract_themes(text: str):
    t = text.lower()
    found = []
    for theme, words in THEME_CATEGORIES.items():
        if any(w in t for w in words):
            found.append(theme)
    # dedupe + cap at 3
    # Remove duplicates, and if there are more than 3 themes, keep only the first 3.
    return list(dict.fromkeys(found))[:3]

if __name__ == '__main__':
    app.run(debug=True, port=5000)
