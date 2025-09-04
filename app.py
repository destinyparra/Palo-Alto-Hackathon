from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from datetime import datetime
from dotenv import load_dotenv
import os

# analysis helpers
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from textblob import TextBlob
import re



# Read environment variables from .env file
load_dotenv()

# Sentiment Analysis Endpoint
vader = SentimentIntensityAnalyzer()


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
        # "summary": summarize(text),

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

def summarize(text):
    sentences = [s.strip() for s in re.split(r'(?<=[.!?]) +', text) if s.strip()]
    if not sentences:
        return text[:100] + "..."
    if len(sentences) == 1:
        return sentences[0]
    return ". ".join(sentences[:2]) + "."

if __name__ == '__main__':
    app.run(debug=True, port=5000)
