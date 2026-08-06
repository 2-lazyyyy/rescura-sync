from sqlalchemy import Column, Integer, String, Boolean
from app.db.session import Base


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    location = Column(String, nullable=False)
    available = Column(Boolean, default=True)
