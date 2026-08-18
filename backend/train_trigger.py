import asyncio
from ml_model import train_rescue_model

async def run():
    print("Starting Training...")
    res = await train_rescue_model()
    print("Training Complete:", res)

if __name__ == "__main__":
    asyncio.run(run())
