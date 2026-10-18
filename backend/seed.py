"""Drop and reseed the database with SAMPLE data. Run: python seed.py"""
import asyncio
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.db import COLLECTIONS, close, connect, get_db

# (name, brand, category, size, unit, [cal, protein, carbs, fat, fiber, sugar], (A, B, C prices))
P = [
    ("Large Eggs", "Happy Hen", "dairy_eggs", 12, "count", [70, 6, 0, 5, 0, 0], (3.49, 2.99, 3.79)),
    ("Whole Milk", "Valley Farms", "dairy_eggs", 64, "fl oz", [150, 8, 12, 8, 0, 12], (3.29, 2.89, 3.49)),
    ("Skim Milk", "Valley Farms", "dairy_eggs", 64, "fl oz", [90, 8, 12, 0, 0, 12], (3.19, 2.79, 3.39)),
    ("Plain Greek Yogurt Nonfat", "Olympus", "dairy_eggs", 32, "oz", [90, 16, 6, 0, 0, 4], (5.49, 4.99, 5.99)),
    ("Cottage Cheese 2%", "Daisy Hill", "dairy_eggs", 16, "oz", [90, 12, 5, 2.5, 0, 4], (3.29, 2.99, 3.59)),
    ("Cheddar Cheese Block", "Tilla", "dairy_eggs", 8, "oz", [110, 7, 0, 9, 0, 0], (3.99, 3.49, 4.29)),
    ("String Cheese", "Tilla", "dairy_eggs", 12, "count", [80, 7, 1, 6, 0, 0], (4.99, 4.49, 5.29)),
    ("Boneless Skinless Chicken Breast", "FarmFresh", "meat_seafood", 2, "lb", [120, 26, 0, 1.5, 0, 0], (8.99, 7.49, 9.49)),
    ("Ground Turkey 93/7", "FarmFresh", "meat_seafood", 1, "lb", [170, 22, 0, 9, 0, 0], (5.99, 5.29, 6.49)),
    ("Ground Beef 85/15", "Prairie", "meat_seafood", 1, "lb", [240, 21, 0, 17, 0, 0], (6.49, 5.99, 6.99)),
    ("Atlantic Salmon Fillet", "Ocean Catch", "meat_seafood", 1, "lb", [200, 22, 0, 12, 0, 0], (10.99, 9.99, 11.99)),
    ("Canned Tuna in Water", "BlueFin", "meat_seafood", 5, "oz", [60, 13, 0, 0.5, 0, 0], (1.49, 1.19, 1.69)),
    ("Extra Firm Tofu", "Soyland", "protein_alt", 14, "oz", [90, 10, 2, 5, 1, 0], (2.49, 1.99, 2.79)),
    ("Black Beans Canned", "Casa Verde", "pantry", 15, "oz", [110, 7, 20, 0, 7, 0], (1.19, 0.99, 1.29)),
    ("Chickpeas Canned", "Casa Verde", "pantry", 15, "oz", [120, 6, 20, 2, 5, 0], (1.19, 0.99, 1.29)),
    ("Dry Red Lentils", "Harvest", "pantry", 16, "oz", [170, 12, 30, 0.5, 5, 1], (2.29, 1.89, 2.49)),
    ("Long Grain White Rice", "Golden Field", "pantry", 32, "oz", [160, 3, 36, 0, 0, 0], (2.99, 2.49, 3.29)),
    ("Brown Rice", "Golden Field", "pantry", 32, "oz", [170, 4, 35, 1.5, 2, 0], (3.29, 2.79, 3.49)),
    ("Old Fashioned Oats", "Morning Mill", "pantry", 42, "oz", [150, 5, 27, 3, 4, 1], (4.49, 3.99, 4.79)),
    ("Whole Wheat Pasta", "Bella", "pantry", 16, "oz", [180, 8, 39, 1.5, 6, 2], (1.79, 1.49, 1.99)),
    ("Spaghetti", "Bella", "pantry", 16, "oz", [200, 7, 42, 1, 2, 2], (1.49, 1.19, 1.69)),
    ("Marinara Sauce", "Nonna's", "pantry", 24, "oz", [70, 2, 10, 2.5, 2, 6], (3.49, 2.99, 3.79)),
    ("Almond Butter", "NutHouse", "pantry", 12, "oz", [190, 7, 6, 17, 3, 1], (7.99, 6.99, 8.49)),
    ("Sunflower Seed Butter", "SunnySide", "pantry", 16, "oz", [200, 7, 6, 16, 2, 3], (5.49, 4.99, 5.99)),
    ("Whole Wheat Bread", "Hearth", "bakery", 20, "oz", [110, 5, 20, 1.5, 3, 3], (3.49, 2.99, 3.79)),
    ("Whole Wheat Tortillas", "Hearth", "bakery", 8, "count", [130, 4, 22, 3, 3, 1], (2.99, 2.49, 3.29)),
    ("Bananas", "Fresh", "produce", 1, "lb", [105, 1.3, 27, 0.4, 3, 14], (0.69, 0.59, 0.79)),
    ("Gala Apples", "Fresh", "produce", 3, "lb", [95, 0.5, 25, 0.3, 4, 19], (4.49, 3.99, 4.99)),
    ("Baby Spinach", "GreenLeaf", "produce", 5, "oz", [20, 2, 3, 0, 2, 0], (3.49, 2.99, 3.99)),
    ("Broccoli Crowns", "Fresh", "produce", 1, "lb", [30, 2.5, 6, 0.3, 2.4, 1.5], (2.49, 1.99, 2.79)),
    ("Carrots", "Fresh", "produce", 2, "lb", [25, 0.5, 6, 0, 1.5, 3], (1.99, 1.69, 2.29)),
    ("Yellow Onions", "Fresh", "produce", 3, "lb", [45, 1, 11, 0, 2, 5], (2.99, 2.49, 3.29)),
    ("Avocados", "Fresh", "produce", 4, "count", [240, 3, 13, 22, 10, 1], (4.99, 3.99, 5.49)),
    ("Frozen Mixed Vegetables", "ChillPak", "frozen", 16, "oz", [60, 3, 12, 0, 3, 3], (1.99, 1.69, 2.29)),
    ("Frozen Blueberries", "ChillPak", "frozen", 16, "oz", [70, 1, 17, 0.5, 4, 11], (3.99, 3.49, 4.49)),
    ("Frozen Edamame Shelled", "ChillPak", "frozen", 12, "oz", [120, 11, 9, 5, 4, 2], (2.99, 2.49, 3.29)),
    ("Protein Bar Chocolate", "MaxFuel", "snacks", 1, "bar", [210, 20, 23, 7, 1, 2], (3.99, 3.49, 4.29)),
    ("Protein Bar Cookie Dough", "FitBite", "snacks", 1, "bar", [190, 21, 22, 6, 9, 1], (2.79, 2.49, 2.99)),
    ("Protein Bar Peanut Butter Crunch", "MaxFuel", "snacks", 1, "bar", [220, 20, 24, 8, 2, 3], (2.99, 2.69, 3.19)),
    ("Greek Yogurt Cup Vanilla", "Olympus", "snacks", 5.3, "oz", [120, 15, 12, 0, 0, 9], (1.49, 1.29, 1.59)),
    ("Granola Bar Oat & Honey", "TrailMix Co", "snacks", 6, "bar", [190, 4, 29, 7, 2, 11], (3.99, 3.49, 4.29)),
    ("Roasted Almonds", "NutHouse", "snacks", 16, "oz", [170, 6, 6, 15, 3, 1], (7.49, 6.49, 7.99)),
    ("Hummus Classic", "Mezze", "snacks", 10, "oz", [70, 2, 4, 5, 1, 0], (3.99, 3.49, 4.29)),
    ("Tortilla Chips", "Casa Verde", "snacks", 12, "oz", [140, 2, 18, 7, 1, 0], (3.49, 2.99, 3.79)),
    ("Whey Protein Powder Vanilla", "MaxFuel", "snacks", 32, "oz", [120, 24, 3, 1.5, 0, 1], (29.99, 26.99, 32.99)),
    ("Granola", "Morning Mill", "breakfast", 12, "oz", [200, 5, 32, 7, 3, 12], (4.49, 3.99, 4.79)),
    ("Frosted Corn Cereal", "Crunchy", "breakfast", 14, "oz", [140, 1, 33, 0, 1, 12], (4.29, 3.79, 4.59)),
    ("Orange Juice", "Sunrise", "beverages", 52, "fl oz", [110, 2, 26, 0, 0, 22], (4.49, 3.99, 4.79)),
    ("Unsweetened Almond Milk", "NutHouse", "beverages", 64, "fl oz", [30, 1, 1, 2.5, 0, 0], (3.49, 2.99, 3.79)),
]

# Fixed ids so demo users keep the same id on every reseed
MAYA_ID = ObjectId("665f00000000000000000001")
ALEX_ID = ObjectId("665f00000000000000000002")
HOUSEHOLD_ID = ObjectId("665f00000000000000000010")
MAYA_PHONE = "+15555550101"
ALEX_PHONE = "+15555550102"


def products():
    keys = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"]
    return [{
        "name": n, "brand": b, "category": c, "size": s, "unit": u,
        "barcode": f"0000{10001 + i:08d}",  # fake barcodes
        "nutrition_per_serving": dict(zip(keys, nut)),
        "prices": dict(zip(["Store A", "Store B", "Store C"], pr)),
        "sample_data": True,
    } for i, (n, b, c, s, u, nut, pr) in enumerate(P)]


async def main():
    await connect()
    db = get_db()
    for name in COLLECTIONS:
        await db.drop_collection(name)
    await connect()  # recreate indexes after drop

    res = await db.products.insert_many(products())
    print(f"Inserted {len(res.inserted_ids)} products")

    maya = {"_id": MAYA_ID, "name": "Maya", "persona": "grad student", "weekly_budget": 60,
            "phone": MAYA_PHONE, "goals": {"protein_g_per_day": 120}, "allergies": ["peanuts"],
            "dietary": [], "sample_data": True}
    alex = {"_id": ALEX_ID, "name": "Alex", "persona": "roommate", "weekly_budget": 50,
            "phone": ALEX_PHONE, "goals": {}, "allergies": [],
            "dietary": [], "sample_data": True}
    await db.users.insert_many([maya, alex])
    uid, aid = str(MAYA_ID), str(ALEX_ID)

    now = datetime.now(timezone.utc)
    pantry = [("Baby Spinach", 1, "bag", 1), ("Plain Greek Yogurt Nonfat", 1, "tub", 2),
              ("Whole Milk", 0.5, "jug", 2), ("Large Eggs", 6, "count", 9),
              ("Boneless Skinless Chicken Breast", 1, "lb", 3), ("Bananas", 3, "count", 4),
              ("Long Grain White Rice", 1, "bag", 365), ("Black Beans Canned", 2, "can", 540),
              ("Granola", 1, "bag", 60), ("Cheddar Cheese Block", 1, "block", 21)]
    await db.pantry_items.insert_many([
        {"user_id": uid, "name": n, "quantity": q, "unit": u,
         "expires_at": now + timedelta(days=d), "added_at": now, "sample_data": True}
        for n, q, u, d in pantry])
    await db.households.insert_one({
        "_id": HOUSEHOLD_ID, "name": "Maya and Alex", "members": [uid, aid],
        "space_id": None, "sample_data": True,
    })
    print(f"Inserted demo user Maya (id={uid}, phone={MAYA_PHONE}) with {len(pantry)} pantry items")
    print(f"Inserted roommate Alex (id={aid}, phone={ALEX_PHONE}) with empty pantry")
    print(f"Inserted household {HOUSEHOLD_ID} (space_id unset until first group message)")
    print("group_carts and savings_ledger are empty")
    await close()


if __name__ == "__main__":
    asyncio.run(main())
