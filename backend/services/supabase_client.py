from typing import List, Dict, Any, cast
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL") or "https://placeholder.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY") or "placeholder_anon_key"

_client = None


def get_supabase_client():
    global _client
    if _client is None:
        try:
            from supabase import create_client
            _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        except Exception as e:
            print(f"Warning: Could not initialize Supabase client ({str(e)})")
            _client = None
    return _client


async def fetch_recent_sos_alerts(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Fetches recent mobile SOS emergency alerts from the 'sos_alerts' database table.
    """
    try:
        from database import AsyncSessionLocal
        from sqlalchemy import select
        import models

        async with AsyncSessionLocal() as db:
            stmt = select(models.SOSAlert).order_by(models.SOSAlert.id.desc()).limit(limit)
            res = await db.execute(stmt)
            records = res.scalars().all()
            if records is not None:
                return [
                    {
                        "id": r.id,
                        "location": r.location or f"({r.latitude}, {r.longitude})",
                        "latitude": r.latitude,
                        "longitude": r.longitude,
                        "affected_count": r.affected_count or r.affected_people or 1,
                        "urgent_need": r.urgent_need,
                        "status": r.status,
                        "created_at": r.created_at.isoformat() if r.created_at else None
                    } for r in records
                ]
    except Exception as e:
        print(f"Notice: Direct DB query for SOS alerts: {e}")

    client = get_supabase_client()
    if client and SUPABASE_URL != "https://placeholder.supabase.co":
        try:
            response = client.table("sos_alerts").select("*").order("created_at", desc=True).limit(limit).execute()
            if response.data is not None:
                return cast(List[Dict[str, Any]], response.data)
        except Exception:
            pass

    return []


def aggregate_sos_demographics(alerts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregates metrics from live mobile SOS alerts.
    """
    if not alerts:
        return {
            "total_sos_alerts": 0,
            "total_affected_people": 0,
            "urgent_need_breakdown": {}
        }

    total_affected = sum(alert.get("affected_count", 0) for alert in alerts)
    need_counts = {}
    for alert in alerts:
        need = alert.get("urgent_need", "General")
        need_counts[need] = need_counts.get(need, 0) + 1

    return {
        "total_sos_alerts": len(alerts),
        "total_affected_people": total_affected,
        "urgent_need_breakdown": need_counts
    }
