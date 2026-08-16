import os
import asyncio

os.environ["DATABASE_URL"] = "postgresql+asyncpg://rescura:rescura123@localhost:5432/rescura_db"

# Now import the modules
import ingest_real_data
import train_now

async def main():
    print("Running ingestion...")
    await ingest_real_data.main()
    print("Running training...")
    await train_now.main()

if __name__ == "__main__":
    asyncio.run(main())
