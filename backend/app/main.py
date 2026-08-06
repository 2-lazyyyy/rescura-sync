from fastapi import FastAPI
from app.routers import resources
from app.db.session import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Rescura Sync")

app.include_router(resources.router, prefix="/api/resources", tags=["resources"])

@app.get("/")
def root():
    return {"message": "Rescura Sync API is running"}
