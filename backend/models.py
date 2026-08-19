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
    
    # Granular Inventory Stock & Max Capacities
    water_inventory: Mapped[float] = mapped_column(Float, default=1200000.0)
    water_capacity: Mapped[float] = mapped_column(Float, default=1500000.0)
    food_inventory: Mapped[float] = mapped_column(Float, default=180000.0)
    food_capacity: Mapped[float] = mapped_column(Float, default=250000.0)
    medical_kits: Mapped[int] = mapped_column(Integer, default=3400)
    medical_capacity: Mapped[int] = mapped_column(Integer, default=5000)
    shelter_packs: Mapped[int] = mapped_column(Integer, default=1200)
    shelter_capacity: Mapped[int] = mapped_column(Integer, default=2500)
    
    # Fleet & Personnel Readiness
    vehicles_count: Mapped[int] = mapped_column(Integer, default=18)
    boats_count: Mapped[int] = mapped_column(Integer, default=8)
    personnel_count: Mapped[int] = mapped_column(Integer, default=45)
    
    # Supply Chain & Analytical Parameters
    average_daily_burn_water: Mapped[float] = mapped_column(Float, default=15000.0)
    average_daily_burn_food: Mapped[float] = mapped_column(Float, default=3200.0)
    lead_time_days: Mapped[float] = mapped_column(Float, default=2.5)
    reorder_threshold_water: Mapped[float] = mapped_column(Float, default=300000.0)
    reorder_threshold_food: Mapped[float] = mapped_column(Float, default=45000.0)
    
    organization_type: Mapped[str] = mapped_column(String(100), default="National Strategic Base")
    status: Mapped[str] = mapped_column(String(50), default="Operational")
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    transactions = relationship("InventoryTransaction", back_populates="depot", cascade="all, delete-orphan")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    depot_id: Mapped[int] = mapped_column(Integer, ForeignKey("rescue_depots.id"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False) # INBOUND, OUTBOUND, AUDIT, DAMAGE_LOSS
    item_category: Mapped[str] = mapped_column(String(50), nullable=False)    # water, food, medical, shelter, vehicles, boats
    quantity_change: Mapped[float] = mapped_column(Float, nullable=False)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False)
    reference_code: Mapped[str] = mapped_column(String(100), default="")
    source_or_destination: Mapped[str] = mapped_column(String(255), default="")
    operator_name: Mapped[str] = mapped_column(String(100), default="Warehouse Officer")
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    depot = relationship("RescueDepot", back_populates="transactions")

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


class DisasterMission(Base):
    __tablename__ = "disaster_missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disaster_identifier: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    disaster_title: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[float] = mapped_column(Float, default=5.0)
    
    # Mission Status: Active, Dispatched, Resolved
    status: Mapped[str] = mapped_column(String(50), default="Active", index=True)
    
    assigned_hub_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("rescue_depots.id"), nullable=True)
    assigned_hub_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Dispatched Resource Counts (Cumulative)
    dispatched_water_liters: Mapped[float] = mapped_column(Float, default=0.0)
    dispatched_food_packs: Mapped[float] = mapped_column(Float, default=0.0)
    dispatched_medical_kits: Mapped[int] = mapped_column(Integer, default=0)
    
    # Target / Predicted Requirement Counts
    target_water_liters: Mapped[float] = mapped_column(Float, default=0.0)
    target_food_packs: Mapped[float] = mapped_column(Float, default=0.0)
    target_medical_kits: Mapped[int] = mapped_column(Integer, default=0)
    
    dispatched_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
