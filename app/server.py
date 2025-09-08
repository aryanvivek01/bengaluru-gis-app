# app/server.py
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import pandas as pd
import os

app = Flask(__name__, static_folder="static", template_folder="static")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

@app.route("/")
def root():
    # serve index.html from app/static
    return app.send_static_file("index.html")

# Serve static files (JS, CSS)
@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

# Serve all files under /data/processed/
@app.route("/data/processed/<path:filename>")
def processed_data(filename):
    return send_from_directory(os.path.join(DATA_DIR, "processed"), filename)


# --- API endpoints ---
@app.route("/api/ward_stats")
def ward_stats():
    csv_path = os.path.join(DATA_DIR, "processed", "ward_stats.csv")
    df = pd.read_csv(csv_path, dtype={"ward_id": str})
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    return jsonify(records)

@app.route("/api/ward_tree_counts")
def ward_tree_counts():
    csv_path = os.path.join(DATA_DIR, "processed", "ward_tree_counts.csv")
    df = pd.read_csv(csv_path, dtype={"ward_id": str})
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    return jsonify(records)

if __name__ == "__main__":
    # Run: python server.py (inside app folder)
    app.run(debug=True, port=5000)
