import datetime
from typing import Optional, List
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from database import Base


class DisasterEvent(Base):
    __tablename__ = "disaster_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    predictions = relationship("ReliefPrediction", back_populates="disaster_event", cascade="all, delete-orphan")


class ReliefPrediction(Base):
    __tablename__ = "relief_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disaster_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("disaster_events.id"), nullable=True)
    water_liters: Mapped[float] = mapped_column(Float, nullable=False)
    food_packs: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    disaster_event = relationship("DisasterEvent", back_populates="predictions")


class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    affected_count: Mapped[int] = mapped_column(Integer, default=1)
    affected_people: Mapped[int] = mapped_column(Integer, default=1)
    urgent_need: Mapped[str] = mapped_column(String(100), default="Water")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReliefDepot(Base):
    __tablename__ = "relief_depots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    water_capacity_liters: Mapped[float] = mapped_column(Float, default=100000.0)
    food_capacity_packs: Mapped[float] = mapped_column(Float, default=50000.0)
    status: Mapped[str] = mapped_column(String(50), default="Operational")
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DisasterZone(Base):
    __tablename__ = "disaster_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[float] = mapped_column(Float, default=5.0)
    radius_km: Mapped[float] = mapped_column(Float, default=6.0)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HistoricalDisaster(Base):
    __tablename__ = "historical_disasters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[float] = mapped_column(Float, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    fatalities: Mapped[int] = mapped_column(Integer, default=0)


class HistoricalRescueOp(Base):
    __tablename__ = "historical_rescue_ops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=17.0)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=96.0)
    severity: Mapped[float] = mapped_column(Float, nullable=False)
    affected_people: Mapped[int] = mapped_column(Integer, nullable=False)
    water_used_liters: Mapped[float] = mapped_column(Float, nullable=False)
    food_used_packs: Mapped[float] = mapped_column(Float, nullable=False)
    rescue_time_hours: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RescueDepot(Base):
    __tablename__ = "rescue_depots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    water_inventory: Mapped[float] = mapped_column(Float, default=50000.0)
    food_inventory: Mapped[float] = mapped_column(Float, default=25000.0)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

class MissionFeedback(Base):
    __tablename__ = "mission_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_title: Mapped[str] = mapped_column(String(255), index=True)
    severity: Mapped[float] = mapped_column(Float)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    event_type: Mapped[str] = mapped_column(String(100), default="Flood")
    terrain: Mapped[str] = mapped_column(String(100), default="Inland_Plain")
    
    # Actual Ground Truth Data (For MLOps)
    actual_rescue_time_hours: Mapped[float] = mapped_column(Float)
    actual_water_liters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_food_packs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    submitted_by: Mapped[str] = mapped_column(String(100), default="Control Room Admin")
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
