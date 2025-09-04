from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from datetime import datetime, timedelta
from dotenv import load_dotenv
from collections import Counter
import os

# analysis helpers
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from textblob import TextBlob
import re



# Read environment variables from .env file
load_dotenv()

# Sentiment Analysis Endpoint
vader = SentimentIntensityAnalyzer()

THEME_CATEGORIES = {
    "work": ["work","job","boss","project","meeting","deadline","office"],
    "health": ["health","run","gym","workout","sleep","tired","doctor"],
    "friends": ["friend","hang","party","buddy","social"],
    "family": ["family","mom","dad","parent","kids","home","sibling"],
    "stress": ["stress","overwhelmed","anxious","worry","pressure"],
    "happiness": ["happy","joy","excited","grateful","smile","laugh"]
}

app = Flask(__name__)
CORS(app)

app.config['MONGO_URI'] = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/Palo-Alto-Hackathon')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'change-me')

# DB setup
mongo = PyMongo(app)


# Health Check
@app.route('/healthz')
def health():
    return jsonify({"ok": True})

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
