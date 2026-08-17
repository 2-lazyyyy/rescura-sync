import os
import numpy as np
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
import models

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


async def ingest_historical_disaster_data(db: AsyncSession) -> int:
    """
    Ingests and cleans real-world historical disaster data for Myanmar from myanmar_historical_data.csv using Pandas,
    and persists records into the HistoricalDisaster database table.
    """
    csv_path = os.path.join(BASE_DIR, "myanmar_historical_data.csv")
    if not os.path.exists(csv_path):
        csv_path = "myanmar_historical_data.csv"

    # Read local CSV file using Pandas
    df = pd.read_csv(csv_path)

    # --- PANDAS DATA CLEANING PIPELINE ---
    # 1. Drop rows where latitude or longitude are null
    df = df.dropna(subset=['latitude', 'longitude'])

    # 2. Fill missing severity values with the mean
    mean_severity = df['severity'].mean() if not df['severity'].empty else 5.0
    df['severity'] = df['severity'].fillna(mean_severity)

    # 3. Clip severity scores between 1.0 and 10.0
    df['severity'] = df['severity'].clip(1.0, 10.0).round(2)

    # Persist cleaned DataFrame records into database
    records_to_insert = []
    for _, row in df.iterrows():
        records_to_insert.append(
            models.HistoricalDisaster(
                event_type=str(row['event_type']),
                latitude=float(row['latitude']),
                longitude=float(row['longitude']),
                severity=float(row['severity']),
                year=int(row.get('year', 2023)),
                fatalities=int(row.get('fatalities', 0))
            )
        )

    db.add_all(records_to_insert)
    await db.commit()

    return len(records_to_insert)


# Backward compatibility alias
ingest_mock_historical_data = ingest_historical_disaster_data

