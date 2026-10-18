import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()
MONGODB_URI = os.getenv("MONGODB_URI", "")
DB_NAME = os.getenv("DB_NAME", "app")

COLLECTIONS = ["users", "households", "pantry_items", "products", "carts",
               "group_carts", "personal_lists", "decisions", "savings_ledger"]

client: AsyncIOMotorClient | None = None


def get_db():
    return client[DB_NAME]


async def connect():
    global client
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    db = get_db()
    await db.products.create_index("barcode")
    await db.products.create_index("category")
    await db.users.create_index("phone")
    await db.pantry_items.create_index("user_id")
    await db.pantry_items.create_index("expires_at")
    await db.households.create_index("members")
    await db.households.create_index("space_id")
    await db.group_carts.create_index("space_id")
    await db.group_carts.create_index("household_id")
    await db.personal_lists.create_index("user_id", unique=True)
    await db.decisions.create_index("user_id")
    await db.savings_ledger.create_index("user_id")


async def close():
    if client:
        client.close()
