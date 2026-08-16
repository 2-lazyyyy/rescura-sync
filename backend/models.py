from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base


class DisasterEvent(Base):
    __tablename__ = "disaster_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    severity = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    predictions = relationship("ReliefPrediction", back_populates="disaster_event", cascade="all, delete-orphan")


class ReliefPrediction(Base):
    __tablename__ = "relief_predictions"

    id = Column(Integer, primary_key=True, index=True)
    disaster_id = Column(Integer, ForeignKey("disaster_events.id"), nullable=True)
    water_liters = Column(Float, nullable=False)
    food_packs = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    disaster_event = relationship("DisasterEvent", back_populates="predictions")


class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, index=True)
    location = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    affected_count = Column(Integer, default=1)
    affected_people = Column(Integer, default=1)
    urgent_need = Column(String(100), default="Water")
    status = Column(String(50), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ReliefDepot(Base):
    __tablename__ = "relief_depots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    water_capacity_liters = Column(Float, default=100000.0)
    food_capacity_packs = Column(Float, default=50000.0)
    status = Column(String(50), default="Operational")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DisasterZone(Base):
    __tablename__ = "disaster_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    severity = Column(Float, default=5.0)
    radius_km = Column(Float, default=6.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HistoricalDisaster(Base):
    __tablename__ = "historical_disasters"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    severity = Column(Float, nullable=False)
    year = Column(Integer, nullable=False)
    fatalities = Column(Integer, default=0)


class HistoricalRescueOp(Base):
    __tablename__ = "historical_rescue_ops"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=True, default=17.0)
    longitude = Column(Float, nullable=True, default=96.0)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    severity = Column(Float, nullable=False)
    affected_people = Column(Integer, nullable=False)
    water_used_liters = Column(Float, nullable=False)
    food_used_packs = Column(Float, nullable=False)
    rescue_time_hours = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RescueDepot(Base):
    __tablename__ = "rescue_depots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    water_inventory = Column(Float, default=50000.0)
    food_inventory = Column(Float, default=25000.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Demographics(Base):
    __tablename__ = "demographics"

    id = Column(Integer, primary_key=True, index=True)
    pcode = Column(String(50), nullable=True)
    township_name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    total_population = Column(Integer, nullable=False)

