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

# root redirect to dev
@app.route('/')
def root():
    return redirect(url_for('dev'))
 


# Writing prompt endpoint
@app.route("/api/prompt", methods=["GET"])
def get_prompt():
    import random
    return jsonify({
        "prompt": random.choice(WRITING_PROMPTS),
        "timestamp": datetime.utcnow().isoformat()
    }), 200


# Creating journal entry (text only for now)
@app.route("/api/entries", methods=["POST"])
def create_entry():
    try:
        data = request.get_json(silent=True) or {}
    
        # validate input
        errors, clean_data = validate_user_input(data)
        if errors:
            return jsonify({"error": "Validation failed", "details": errors}), 400

        text = clean_data["text"]
        user_id = clean_data["userId"]

        # Analyze content
        analysis = analyze_sentiment(text)
        themes = extract_themes(text)
        summary = summarize(text)

        # create document
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

        # Format for response
        doc["_id"] = str(result.inserted_id)
        doc["createdAt"] = doc["createdAt"].isoformat()


        # Logging for debugging
        logger.info(f"New entry created for user: {user_id}, {len(themes)} themes detected.")
        
        return jsonify({
            "success": True,
            "entry": doc,
            "message": "Entry created successfully"
        }), 201
    
    except Exception as e:
        logger.error(f"Error creating entry: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Internal Server Error"}), 500
    

# Fetching journal entries
@app.route("/api/entries", methods=["GET"])
def get_entries():
    try:
        user_id = request.args.get("userId", "default_user")
        limit = min(int(request.args.get("limit", 50)), 100)  # max 100
        skip = int(request.args.get("skip", 0))

        items = list(
            mongo.db.entries.find({"userId": user_id})
            .sort("createdAt", -1)
            .skip(skip)
            .limit(50)
        )
        
        # format dates
        for item in items:
            item["_id"] = str(item["_id"])
            if hasattr(item.get("createdAt"), "isoformat"):
                item["createdAt"] = item["createdAt"].isoformat()

        return jsonify({
            "success": True,
            "entries": items,
            "count": len(items),
            "hasMore": len(items) == limit
        }), 200
    except Exception as e:
        logger.error(f"Error fetching entries: {str(e)}")
        return jsonify({"error": "Failed to fetch entries"}), 500


# Fetching insights
@app.route("/api/insights", methods=["GET"])
def get_insights():
    try:
        user_id = request.args.get("userId", "default_user")
        period = request.args.get("period", "weekly") #weekly or monthly

        # calc date range
        # change later to use accurate month handling
        end_date = datetime.utcnow()
        if period == "weekly":
            start_date = end_date - timedelta(days=7)
        elif period == "monthly":
            start_date = end_date - timedelta(month=30)
        else:
            start_date = end_date - timedelta(days=7)  # default to weekly

        items = list(mongo.db.entries.find({
            "userId": user_id,
            "createdAt": {"$gte": start_date, "$lte": end_date}
        }))

        if not items:
                return jsonify({
                    "success": True,
                    "userId": user_id,
                    "entryCount": 0,
                    "avgSentiment": 0,
                    "topThemes": [],
                    "themeCounts": {},
                    "insights": {},
                    "startDate": start_date.isoformat(),
                    "endDate": end_date.isoformat(),
                    "period": period
                }), 200
        
        # basic stats
        sentiments = [e.get("sentiment", 0) for e in items]
        avg_sentiment = sum(sentiments) / len(sentiments)

        # themes analysis
        all_themes = []
        for e in items:
            themes = e.get("themes", [])
            if isinstance(themes, list):
                all_themes.extend(themes)

            
        theme_counts = Counter(all_themes)
        top_themes = [theme for theme, count in theme_counts.most_common(3)]

        # Advanced insights
        word_counts = [e.get("wordCount", 0) for e in items if e.get("wordCount")]
        avg_word_count = sum(word_counts) / len(word_counts) if word_counts else 0

        insights = {
            "avgWordCount": round(avg_word_count, 1),
            "sentimentTrend": "improving" if len(sentiments) > 1 and sentiments[0] > sentiments[-1] else "stable",
            "writingFrequency": len(items) / 7 if period == "weekly" else len(items) / 30,
            "emotionalRange": max(sentiments) - min(sentiments) if sentiments else 0

        }

        return jsonify({
            "success": True,
            "userId": user_id,
            "entryCount": len(items),
            "avgSentiment": round(avg_sentiment, 3),
            "topThemes": top_themes,
            "themeCounts": dict(theme_counts),
            "insights": insights,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "period": period
        }), 200
    
    except Exception as e:
        logger.error(f"Error fetching insights: {str(e)}")
        return jsonify({"error": "Failed to fetch insights"}), 500

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
