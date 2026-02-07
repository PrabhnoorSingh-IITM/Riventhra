from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

# Try several common locations for the serialized model
MODEL_PATHS = [
    os.path.join("ml", "models", "water_potability_model.pkl"),
    os.path.join("ml", "water_potability_model.pkl"),
    "water_potability_model.pkl",
]

model = None
for p in MODEL_PATHS:
    if os.path.exists(p):
        try:
            model = joblib.load(p)
            logging.info(f"Loaded model from {p}")
            break
        except Exception as e:
            logging.exception(f"Failed loading model at {p}: {e}")

if model is None:
    logging.warning("No model found. Prediction endpoint will return 503 until a model is placed in one of the known paths.")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})


@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model not loaded on server"}), 503

    data = request.get_json(force=True)
    required = ["ph", "Hardness", "Solids", "Chloramines", "Sulfate", "Conductivity", "Organic_carbon", "Trihalomethanes", "Turbidity"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing one or more required features", "required": required}), 400

    try:
        features = np.array([[
            data["ph"],
            data["Hardness"],
            data["Solids"],
            data["Chloramines"],
            data["Sulfate"],
            data["Conductivity"],
            data["Organic_carbon"],
            data["Trihalomethanes"],
            data["Turbidity"]
        ]], dtype=float)

        pred = model.predict(features)[0]
        prob = None
        if hasattr(model, "predict_proba"):
            prob = float(model.predict_proba(features)[0].max())

        return jsonify({"prediction": int(pred), "result": "Potable" if int(pred)==1 else "Not Potable", "confidence": prob})

    except Exception as e:
        logging.exception("Prediction failed")
        return jsonify({"error": "Prediction failed", "details": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
