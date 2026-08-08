from typing import Dict, Any
import os
import pandas as pd
from sklearn.ensemble import RandomForestRegressor


class ReliefPredictor:
    def __init__(self):
        self.water_model = RandomForestRegressor(n_estimators=10, random_state=42)
        self.food_model = RandomForestRegressor(n_estimators=10, random_state=42)
        self.is_fitted = False

    def train_models(self, csv_file_path: str) -> Dict[str, Any]:
        """
        Reads training data from a CSV file expecting features:
        ['population', 'vulnerable_ratio', 'disaster_severity']
        and targets: ['water_needed', 'food_needed'].
        Fits self.water_model and self.food_model using this data.
        """
        if not os.path.exists(csv_file_path):
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            alt_path = os.path.join(backend_dir, csv_file_path)
            if os.path.exists(alt_path):
                csv_file_path = alt_path

        if not os.path.exists(csv_file_path):
            raise FileNotFoundError(f"Training CSV file not found at: {csv_file_path}")

        df = pd.read_csv(csv_file_path)
        required_cols = ['population', 'vulnerable_ratio', 'disaster_severity', 'water_needed', 'food_needed']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column '{col}' in training CSV.")

        X = df[['population', 'vulnerable_ratio', 'disaster_severity']]
        y_water = df['water_needed']
        y_food = df['food_needed']

        self.water_model.fit(X, y_water)
        self.food_model.fit(X, y_food)
        self.is_fitted = True

        return {
            "status": "success",
            "message": "Models successfully trained",
            "samples_trained": len(df)
        }

    def predict_supplies(self, population: int, vulnerable_ratio: float, disaster_severity: float) -> Dict[str, Any]:
        """
        Calls .predict() on trained water and food models if fitted.
        Otherwise returns an error stating the model needs training data.
        """
        if not self.is_fitted:
            return {
                "error": "Model needs training data before making predictions. Please train the model first."
            }

        input_df = pd.DataFrame([{
            'population': population,
            'vulnerable_ratio': vulnerable_ratio,
            'disaster_severity': disaster_severity
        }])

        water_pred = float(self.water_model.predict(input_df)[0])
        food_pred = float(self.food_model.predict(input_df)[0])

        return {
            "population": population,
            "vulnerable_ratio": vulnerable_ratio,
            "disaster_severity": disaster_severity,
            "water_liters": round(water_pred, 2),
            "food_packs": round(food_pred, 2)
        }
