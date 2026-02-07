from flask import Flask, request, jsonify
import joblib
import numpy as np

app = Flask(__name__)

# Load model 
model = joblib.load("/data/cleaned/water potability model.pkl")

@app.route("/predict", methods=["POST"])
def predict():
    data = request.json
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
    ]])

    prediction = model.predict(features)
  
    return jsonify({
        "potability": int(prediction),
        "result": "Potable" if prediction == 1 else "Not Potable"
    })

if __name__ == "__main__":
    app.run(debug=True)
