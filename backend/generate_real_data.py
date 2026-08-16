import pandas as pd
import numpy as np
import random
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def generate_mimu_demographics():
    # Generate realistic MIMU style Pcode population data (Township/Village tract proxy)
    # We will generate around 330 townships in Myanmar with realistic coordinates
    
    np.random.seed(42)
    # Bounding box roughly: Lat 10.0 to 28.0, Lon 92.0 to 101.0
    num_townships = 330
    
    lats = np.random.uniform(10.0, 28.0, num_townships)
    lons = np.random.uniform(92.0, 101.0, num_townships)
    
    # Population highly skewed (Yangon area very dense, others sparse)
    # Pareto distribution to simulate city vs rural
    pops = (np.random.pareto(a=1.5, size=num_townships) * 50000).astype(int) + 5000
    
    data = []
    for i in range(num_townships):
        data.append({
            'pcode': f'MMR{i:03d}',
            'township_name': f'Township_{i}',
            'latitude': round(lats[i], 4),
            'longitude': round(lons[i], 4),
            'total_population': pops[i]
        })
        
    df = pd.DataFrame(data)
    df.to_csv(os.path.join(BASE_DIR, "mimu_demographics_realistic.csv"), index=False)
    print("Generated realistic demographics: mimu_demographics_realistic.csv")

def generate_emdat_disasters():
    # Generate EM-DAT style historical records (2000-2025)
    np.random.seed(42)
    num_records = 300
    
    event_types = ['Flood', 'Cyclone', 'Earthquake', 'Landslide']
    
    data = []
    for i in range(num_records):
        ev_type = np.random.choice(event_types, p=[0.5, 0.2, 0.2, 0.1])
        lat = round(np.random.uniform(10.0, 28.0), 4)
        lon = round(np.random.uniform(92.0, 101.0), 4)
        
        # Ground truth: Affected people isn't just randomly generated, it relates to the severity 
        # and some underlying hidden true population (we simulate this)
        severity = round(np.random.uniform(3.0, 9.5), 1)
        base_pop = int(np.random.exponential(50000)) + 1000
        
        affected_ratio = min(1.0, (severity / 10.0) * np.random.uniform(0.1, 1.2))
        affected_people = int(base_pop * affected_ratio)
        
        # Real-world aid distributed isn't perfectly linear. 
        # Cyclone/Flood might need more water. Earthquakes might need more rescue time.
        water_base = affected_people * 20.0 # Sphere standard
        food_base = affected_people * 3.0
        
        # Add non-linear noise and event-specific biases
        if ev_type == 'Flood':
            water_delivered = water_base * np.random.uniform(0.8, 1.5) # Hard to get clean water
            food_delivered = food_base * np.random.uniform(0.7, 1.2)
            rescue_time = severity * np.random.uniform(2.0, 4.0)
        elif ev_type == 'Earthquake':
            water_delivered = water_base * np.random.uniform(0.5, 1.1)
            food_delivered = food_base * np.random.uniform(0.9, 1.4)
            rescue_time = severity * np.random.uniform(5.0, 10.0) # Digging rubble
        elif ev_type == 'Cyclone':
            water_delivered = water_base * np.random.uniform(0.9, 1.6)
            food_delivered = food_base * np.random.uniform(1.0, 1.5)
            rescue_time = severity * np.random.uniform(3.0, 6.0)
        else:
            water_delivered = water_base * np.random.uniform(0.6, 1.2)
            food_delivered = food_base * np.random.uniform(0.6, 1.2)
            rescue_time = severity * np.random.uniform(2.0, 5.0)

        data.append({
            'year': np.random.randint(2000, 2026),
            'event_type': ev_type,
            'latitude': lat,
            'longitude': lon,
            'severity_scale': severity,
            'actual_affected_population': affected_people,
            'water_liters_distributed': round(water_delivered, 1),
            'food_packs_distributed': round(food_delivered, 1),
            'avg_rescue_time_hours': round(rescue_time, 1)
        })
        
    df = pd.DataFrame(data)
    df.to_csv(os.path.join(BASE_DIR, "emdat_disasters_realistic.csv"), index=False)
    print("Generated realistic disasters: emdat_disasters_realistic.csv")

if __name__ == "__main__":
    generate_mimu_demographics()
    generate_emdat_disasters()
