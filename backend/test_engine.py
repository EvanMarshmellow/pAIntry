"""Offline tests: engine math + Grok fallback (no DB, no API key). Run: python test_engine.py"""
import asyncio
import os

from app.agent import CartContext, fallback
from app.engine import (
    add_group_pantry_item, add_spoken_personal_pantry_item, add_to_group_cart, analyze,
    analyze_pantry_food_groups, bump_repeat_line, clear_personal_list, empty_group_cart,
    live_search_terms, merge_personal_lists, move_cart_line_to_group_pantry,
    move_personal_list_to_pantry, pantry_edible_grams, pantry_food_group, pick_live_product,
    remove_group_pantry_item, resolve_product, set_group_pantry_quantity,
    set_personal_list_quantity, split_grocery_phrases,
)
from app.personal_agent import (PersonalContext, fallback as personal_fallback, parse_add_queries,
                                parse_pantry_move)
from app.grok import DATA_SOURCES, Verdict, explain, postprocess


def prod(name, cat, protein, prices, **kw):
    return {"_id": name, "name": name, "brand": kw.pop("brand", "X"), "category": cat,
            "nutrition_per_serving": {"protein_g": protein}, "prices": prices, **kw}


BAR = prod("Protein Bar Chocolate", "snacks", 20, {"Store A": 3.99, "Store B": 3.49})
YOG = prod("Greek Yogurt Cup Vanilla", "snacks", 15, {"Store B": 1.29})
PB = prod("Protein Bar Peanut Butter Crunch", "snacks", 20, {"Store B": 2.69})
CHIPS = prod("Chips", "snacks", 2, {"Store A": 1.00})
MAYA = {"weekly_budget": 60, "allergies": ["peanuts"], "goals": {"protein_g_per_day": 120}}
ALTS = [BAR, YOG, PB, CHIPS]


def test_swap():
    f = analyze(BAR, MAYA, [], ALTS)
    assert f["product"]["cheapest_store"] == "Store B" and f["product"]["price"] == 3.49
    assert f["alternative"]["name"] == "Greek Yogurt Cup Vanilla"  # peanut bar excluded, chips worse cpp
    assert f["savings"] == 2.20 and f["draft_verdict"] == "Swap"


def test_allergy_skip():
    f = analyze(PB, MAYA, [], ALTS)
    assert f["allergy_conflicts"] == ["peanuts"] and f["draft_verdict"] == "Skip"


def test_pantry_and_budget():
    f = analyze(YOG, MAYA, [{"name": "Greek Yogurt Cup Vanilla"}], ALTS)
    assert f["similar_in_pantry"] and f["draft_verdict"] == "Skip"
    f = analyze(YOG, MAYA, [], ALTS, week_spent=59.5)
    assert f["budget"]["remaining"] == 0.5 and f["draft_verdict"] == "Skip"
    assert analyze(YOG, MAYA, [], ALTS)["draft_verdict"] == "Buy"


def test_fallback_without_key():
    os.environ.pop("XAI_API_KEY", None)
    r = asyncio.run(explain(analyze(BAR, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Swap" and r["savings"] == 2.20
    assert r["better_alternative"] == {"name": "Greek Yogurt Cup Vanilla", "store": "Store B", "price": 1.29}


def test_fallback_bad_key():
    os.environ["XAI_API_KEY"] = "invalid"
    r = asyncio.run(explain(analyze(PB, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Skip"
    os.environ.pop("XAI_API_KEY")


def test_postprocess_fixes_vague_output():
    f = analyze(BAR, MAYA, [], ALTS)
    v = Verdict(verdict="Swap", headline="Swap for cheaper protein at Store B",
                reasons=["Lower cost per gram protein", "Same store availability"],
                data_sources=["get_alternatives", "get_pantry"], savings=9.99)
    r = postprocess(v, f)
    assert r["headline"] == "Swap to Greek Yogurt Cup Vanilla, save $2.20"
    assert r["savings"] == 2.20 and r["data_sources"] == DATA_SOURCES
    assert sum(any(c.isdigit() for c in x) for x in r["reasons"]) >= 2 and len(r["reasons"]) <= 3


def test_postprocess_keeps_good_output():
    f = analyze(BAR, MAYA, [], ALTS)
    good = ["Saves $2.20 per snack", "15g protein for $1.29"]
    r = postprocess(Verdict(verdict="Swap", headline="Swap to Greek Yogurt Cup Vanilla, save $2.20", reasons=good), f)
    assert r["reasons"] == good


def test_postprocess_allergy_overrides():
    f = analyze(PB, MAYA, [], ALTS)
    r = postprocess(Verdict(verdict="Swap", headline="Swap it", reasons=[]), f)
    assert r["verdict"] == "Skip" and any("peanuts" in x for x in r["reasons"])
    if f["alternative"]:
        assert r["better_alternative"]["name"] == f["alternative"]["name"]
        assert r["savings"] == f["savings"]
    else:
        assert r["better_alternative"] is None and r["savings"] == 0


def _seed_product(name, category, size, unit, calories=100, **nut):
    base = {"calories": calories, "protein_g": 5, "carbs_g": 10, "fat_g": 2, "fiber_g": 1, "sugar_g": 2}
    base.update(nut)
    return {
        "_id": name.replace(" ", "_"),
        "name": name,
        "category": category,
        "size": size,
        "unit": unit,
        "nutrition_per_serving": base,
        "prices": {"Store A": 1.0},
    }


MAYA_PRODUCTS = [
    _seed_product("Baby Spinach", "produce", 5, "oz", 20, protein_g=2, carbs_g=3),
    _seed_product("Plain Greek Yogurt Nonfat", "dairy_eggs", 32, "oz", 90, protein_g=16),
    _seed_product("Whole Milk", "dairy_eggs", 64, "fl oz", 150, protein_g=8, sugar_g=12),
    _seed_product("Large Eggs", "dairy_eggs", 12, "count", 70, protein_g=6, fat_g=5),
    _seed_product("Boneless Skinless Chicken Breast", "meat_seafood", 2, "lb", 120, protein_g=26),
    _seed_product("Bananas", "produce", 1, "lb", 105, protein_g=1, carbs_g=27, sugar_g=14),
    _seed_product("Long Grain White Rice", "pantry", 32, "oz", 160, protein_g=3, carbs_g=36),
    _seed_product("Black Beans Canned", "pantry", 15, "oz", 110, protein_g=7, carbs_g=20),
    _seed_product("Granola", "breakfast", 12, "oz", 200, protein_g=5, carbs_g=32, sugar_g=12),
    _seed_product("Cheddar Cheese Block", "dairy_eggs", 8, "oz", 110, protein_g=7, fat_g=9),
    _seed_product("Protein Bar Peanut Butter Crunch", "snacks", 1, "bar", 220, protein_g=20, sugar_g=3),
]

MAYA_PANTRY = [
    {"name": "Baby Spinach", "quantity": 1, "unit": "bag"},
    {"name": "Plain Greek Yogurt Nonfat", "quantity": 1, "unit": "tub"},
    {"name": "Whole Milk", "quantity": 0.5, "unit": "jug"},
    {"name": "Large Eggs", "quantity": 6, "unit": "count"},
    {"name": "Boneless Skinless Chicken Breast", "quantity": 1, "unit": "lb"},
    {"name": "Bananas", "quantity": 3, "unit": "count"},
    {"name": "Long Grain White Rice", "quantity": 1, "unit": "bag"},
    {"name": "Black Beans Canned", "quantity": 2, "unit": "can"},
    {"name": "Granola", "quantity": 1, "unit": "bag"},
    {"name": "Cheddar Cheese Block", "quantity": 1, "unit": "block"},
]


def test_group_pantry_add_remove_and_zero_quantity():
    items, added = add_group_pantry_item([], "Whole Milk", quantity=1, added_by="maya")
    assert added["action"] == "added" and items[0]["quantity"] == 1
    items, bumped = add_group_pantry_item(items, "milk", quantity=1)
    assert bumped["action"] == "quantity" and bumped["quantity"] == 2 and len(items) == 1
    items, removed = remove_group_pantry_item(items, "milk")
    assert removed["action"] == "removed" and items == []
    items, _ = add_group_pantry_item([], "Eggs", quantity=3)
    items, cleared = set_group_pantry_quantity(items, "eggs", 0)
    assert cleared["action"] == "removed" and items == []


def test_move_cart_line_touches_only_the_lists_it_is_given():
    personal = [{"name": "Whole Milk", "quantity": 1, "user_id": "maya"}]
    cart = {"items": [{"product_id": "m", "name": "Whole Milk", "quantity": 1,
                       "requesters": ["a"], "store": "Store A", "price": 2.0}],
            "skipped": []}
    cart_before = [dict(line) for line in cart["items"]]
    group = []
    moved_cart, group_after, result = move_cart_line_to_group_pantry(cart, group, "milk", "+1555")
    assert personal == [{"name": "Whole Milk", "quantity": 1, "user_id": "maya"}]
    assert cart["items"] == cart_before and group == []
    assert moved_cart["items"] == []
    assert group_after[0]["name"] == "Whole Milk" and result["from_cart"] is True
    still_cart, added_pantry, result = move_cart_line_to_group_pantry(
        {"items": [{"product_id": "e", "name": "Large Eggs", "quantity": 1, "requesters": ["a"]}],
         "skipped": []},
        [], "hummus", "+1555")
    assert still_cart["items"][0]["name"] == "Large Eggs"
    assert added_pantry[0]["name"] == "hummus" and result["from_cart"] is False


def test_group_cart_skips_only_the_pantry_list_it_is_given():
    product = {"_id": "m", "name": "Whole Milk", "prices": {"Store A": 2.0}}
    personal = [{"name": "Whole Milk"}]
    cart, result = add_to_group_cart(empty_group_cart(), product, "u", [])
    assert result["action"] == "added" and cart["items"]
    cart, result = add_to_group_cart(empty_group_cart(), product, "u", personal)
    assert result["action"] == "skipped" and result["pantry_name"] == "Whole Milk"
    assert personal == [{"name": "Whole Milk"}]


def test_list_phrase_skips_group_pantry_and_pantry_phrase_skips_the_list():
    milk = {"_id": "m", "name": "Whole Milk", "prices": {"Store A": 3.29}}
    personal = [{"name": "Whole Milk", "quantity": 9, "user_id": "maya"}]

    async def milk_finder(query, pantry=None):
        found = resolve_product(query, [milk], pantry)
        if not found:
            return {"status": "not_found", "query": query}
        return {"status": "found", "query": query, "product": found}

    ctx = CartContext([milk], [], {"items": [], "skipped": []}, "u", "Maya", finder=milk_finder)
    listed = asyncio.run(fallback("add milk", ctx))
    assert listed["cart"]["count"] == 1 and listed["pantry"] == []
    ctx = CartContext(
        [milk], [{"name": "Whole Milk", "quantity": 1, "unit": "item"}],
        {"items": [], "skipped": []}, "u", "Maya", finder=milk_finder)
    skipped = asyncio.run(fallback("we need milk", ctx))
    assert skipped["cart"]["count"] == 0 and "group pantry" in skipped["reply"]
    ctx = CartContext([milk], [], {"items": [], "skipped": []}, "+1999", "Roommate")
    stocked = asyncio.run(fallback("add milk to the pantry", ctx))
    assert stocked["cart"]["count"] == 0
    assert stocked["pantry"][0]["name"] == "Whole Milk"
    assert personal[0]["quantity"] == 9


def test_pantry_food_group_classify():
    assert pantry_food_group(_seed_product("Bananas", "produce", 1, "lb")) == "fruits"
    assert pantry_food_group(_seed_product("Baby Spinach", "produce", 5, "oz")) == "vegetables"
    assert pantry_food_group(_seed_product("Almond Butter", "pantry", 12, "oz", fat_g=17)) == "sweets_fats"
    assert pantry_food_group(PB) == "proteins_dairy"


def test_pantry_edible_grams_milk_half_jug():
    milk = _seed_product("Whole Milk", "dairy_eggs", 64, "fl oz")
    g = pantry_edible_grams({"name": "Whole Milk", "quantity": 0.5, "unit": "jug"}, milk)
    assert 900 < g < 1000


def test_pantry_food_groups_maya_mix():
    r = analyze_pantry_food_groups(MAYA_PANTRY, MAYA_PRODUCTS, user_id="665f00000000000000000001")
    assert r["primary_metric"] == "calories"
    assert r["pyramid_model"] == "classic"
    assert r["pyramid_targets"]["grains"] == 30
    assert r["pyramid_targets"]["fruits"] == 20
    cal_pcts = [r["groups"][g]["pct_calories"] for g in r["groups"]]
    assert 99 <= sum(cal_pcts) <= 101
    assert r["groups"]["grains"]["target_pct"] == 30
    assert r["groups"]["grains"]["label"] == "Grains"
    assert all(line["group"] for line in r["lines"])


def test_pantry_food_groups_kroger_string_size():
    # Kroger-imported catalog rows store size as "16 fl oz" with no unit.
    dressing = {"_id": "ranch", "name": "Hidden Valley Original Ranch Salad Dressing",
                "category": "pantry", "size": "16 fl oz",
                "nutrition_per_serving": {"calories": 140, "fat_g": 14}}
    assert pantry_edible_grams({"name": "HIDDEN VALLEY", "quantity": 1, "unit": "item"}, dressing) > 0
    r = analyze_pantry_food_groups(
        [{"name": "Hidden Valley Original Ranch Salad Dressing", "quantity": 1, "unit": "item"}],
        [dressing],
    )
    assert r["lines"][0]["matched_product"] is True


def test_pantry_unmatched_name_only():
    r = analyze_pantry_food_groups(
        [{"name": "mystery kale bunch", "quantity": 2, "unit": "bag"}],
        [],
    )
    assert r["lines"][0]["matched_product"] is False
    assert r["lines"][0]["group"] == "vegetables"
    assert r["groups"]["vegetables"]["grams_on_hand"] > 0


def _hit(name, brand="Store"):
    return {"_id": name, "name": name, "brand": brand, "prices": {"QFC": 2.99}}


def test_pick_live_product_everyday_groceries():
    hits = [
        _hit("Oreo Chocolate Sandwich Cookies", "Nabisco"),
        _hit("Large Brown Eggs", "Simple Truth"),
        _hit("Bananas", "Fresh"),
        _hit("Tomato on the Vine", "Fresh"),
        _hit("Russet Potatoes", "Fresh"),
        _hit("Chobani Nonfat Greek Yogurt", "Chobani"),
        _hit("Boneless Skinless Chicken Breast", "Foster Farms"),
        _hit("Chicken Thighs", "Foster Farms"),
        _hit("Ground Beef 85/15", "Kroger"),
        _hit("Ground Turkey 93/7", "Kroger"),
        _hit("Oatly Oatmilk Original", "Oatly"),
        _hit("Coca-Cola Classic", "Coca-Cola"),
        _hit("Kraft Macaroni & Cheese", "Kraft"),
        _hit("Bounty Paper Towels", "Bounty"),
        _hit("Charmin Bath Tissue", "Charmin"),
        _hit("Hellmann's Real Mayonnaise", "Hellmann's"),
        _hit("Jif Creamy Peanut Butter", "Jif"),
        _hit("Challenge Salted Butter", "Challenge"),
        _hit("Tillamook Sharp Cheddar Cheese", "Tillamook"),
        _hit("Kraft Deli Cheese Slices", "Kraft"),
        _hit("Barilla Spaghetti", "Barilla"),
        _hit("California Olive Ranch Olive Oil", "California Olive Ranch"),
        _hit("Crisco Vegetable Oil", "Crisco"),
        _hit("Haagen-Dazs Vanilla Ice Cream", "Haagen-Dazs"),
        _hit("Heavy Whipping Cream", "Darigold"),
        _hit("Daisy Sour Cream", "Daisy"),
        _hit("Cheerios Cereal", "General Mills"),
        _hit("Tropicana Orange Juice", "Tropicana"),
        _hit("Minute Maid Apple Juice", "Minute Maid"),
        _hit("Frozen Blueberries", "Kroger"),
        _hit("Sara Lee White Sandwich Bread", "Sara Lee"),
        _hit("Whole Wheat Bread", "Dave's"),
        _hit("Bread and Butter Pickles", "Vlasic"),
        _hit("Kroger Vitamin D Whole Milk", "Kroger"),
        _hit("Almond Breeze Unsweetened Almond Milk", "Almond Breeze"),
        _hit("Fat Free Milk", "Kroger"),
        _hit("Reduced Fat 2% Milk", "Kroger"),
        _hit("Hamburger Buns", "Kroger"),
        _hit("Ground Hamburger", "Kroger"),
        _hit("Ham Steak", "Kroger"),
        _hit("Ore-Ida French Fries", "Ore-Ida"),
        _hit("Pop-Tarts Frosted Strawberry", "Kellogg's"),
        _hit("Cheez-It Original", "Sunshine"),
        _hit("Dawn Dishwashing Liquid", "Dawn"),
        _hit("Glad ForceFlex Garbage Bags", "Glad"),
        _hit("Reynolds Wrap Aluminum Foil", "Reynolds"),
        _hit("Glad Plastic Wrap", "Glad"),
        _hit("Kleenex Facial Tissue", "Kleenex"),
        _hit("Q-tips Cotton Swabs", "Q-tips"),
        _hit("Band-Aid Adhesive Bandages", "Band-Aid"),
        _hit("Green Onions", "Fresh"),
        _hit("Mountain Dew", "Pepsi"),
        _hit("Sweet Baby Ray's Barbecue Sauce", "Sweet Baby Ray's"),
        _hit("Heinz Tomato Ketchup", "Heinz"),
        _hit("Cool Whip Extra Creamy Whipped Topping", "Cool Whip"),
        _hit("Welch's Grape Jelly", "Welch's"),
        _hit("Eggo Homestyle Waffles", "Eggo"),
        _hit("Milk Chocolate Bar", "Hershey's"),
    ]
    expect = {
        "oreos": "Oreo Chocolate Sandwich Cookies",
        "eggs": "Large Brown Eggs",
        "bananas": "Bananas",
        "tomatoes": "Tomato on the Vine",
        "potatoes": "Russet Potatoes",
        "greek yogurt": "Chobani Nonfat Greek Yogurt",
        "chicken breast": "Boneless Skinless Chicken Breast",
        "ground beef": "Ground Beef 85/15",
        "oat milk": "Oatly Oatmilk Original",
        "coke": "Coca-Cola Classic",
        "mac and cheese": "Kraft Macaroni & Cheese",
        "paper towels": "Bounty Paper Towels",
        "toilet paper": "Charmin Bath Tissue",
        "mayo": "Hellmann's Real Mayonnaise",
        "peanut butter": "Jif Creamy Peanut Butter",
        "butter": "Challenge Salted Butter",
        "cheddar": "Tillamook Sharp Cheddar Cheese",
        "cheese": "Kraft Deli Cheese Slices",
        "spaghetti": "Barilla Spaghetti",
        "olive oil": "California Olive Ranch Olive Oil",
        "ice cream": "Haagen-Dazs Vanilla Ice Cream",
        "cream": "Heavy Whipping Cream",
        "cheerios": "Cheerios Cereal",
        "oj": "Tropicana Orange Juice",
        "orange juice": "Tropicana Orange Juice",
        "berries": "Frozen Blueberries",
        "bread": "Sara Lee White Sandwich Bread",
        "milk": "Kroger Vitamin D Whole Milk",
        "burgers": "Ground Hamburger",
        "ham": "Ham Steak",
        "fries": "Ore-Ida French Fries",
        "pop tarts": "Pop-Tarts Frosted Strawberry",
        "cheez its": "Cheez-It Original",
        "dish soap": "Dawn Dishwashing Liquid",
        "trash bags": "Glad ForceFlex Garbage Bags",
        "tin foil": "Reynolds Wrap Aluminum Foil",
        "saran wrap": "Glad Plastic Wrap",
        "kleenex": "Kleenex Facial Tissue",
        "q-tips": "Q-tips Cotton Swabs",
        "band-aids": "Band-Aid Adhesive Bandages",
        "scallions": "Green Onions",
        "mt dew": "Mountain Dew",
        "bbq sauce": "Sweet Baby Ray's Barbecue Sauce",
        "catsup": "Heinz Tomato Ketchup",
        "cool whip": "Cool Whip Extra Creamy Whipped Topping",
        "pb": "Jif Creamy Peanut Butter",
        "skim milk": "Fat Free Milk",
        "2% milk": "Reduced Fat 2% Milk",
        "jelly": "Welch's Grape Jelly",
    }
    for query, name in expect.items():
        got = pick_live_product(query, hits)
        assert got and got["name"] == name, (query, None if not got else got["name"])
    assert pick_live_product("zzzznotfood", hits) is None
    assert pick_live_product("ham", [_hit("Hamburger Buns")]) is None
    assert pick_live_product("milk", hits, [{"name": "Almond Milk"}])["name"] == "Almond Breeze Unsweetened Almond Milk"
    assert "orange juice" in live_search_terms("oj")
    assert live_search_terms("Oreos") == ["Oreos"]


def test_split_everyday_grocery_phrases():
    assert parse_add_queries("add mac and cheese and milk to my list") == ["mac and cheese", "milk"]
    assert parse_add_queries("add peanut butter and jelly") == ["peanut butter", "jelly"]
    assert split_grocery_phrases("peas and carrots, bread") == ["peas and carrots", "bread"]


def test_repeat_add_bumps_same_retail_item():
    cart = {"items": [{
        "product_id": "111", "name": "Oreo Chocolate Sandwich Cookies", "quantity": 1,
        "store": "QFC University Village", "price": 4.29,
    }], "skipped": []}
    product = {"_id": "222", "name": "Oreo Chocolate Sandwich Cookies Family Size", "prices": {"QFC": 6.99}}
    updated, result = bump_repeat_line(cart, product)
    assert result["action"] == "quantity" and result["quantity"] == 2
    assert result["product_id"] == "111" and updated["items"][0]["price"] == 4.29


def test_personal_list_adds_live_groceries_not_seed():
    hits = [
        _hit("Oreo Chocolate Sandwich Cookies", "Nabisco"),
        _hit("Kroger Vitamin D Whole Milk", "Kroger"),
        _hit("Large Brown Eggs", "Simple Truth"),
        _hit("Bananas", "Fresh"),
        _hit("Sara Lee White Sandwich Bread", "Sara Lee"),
        _hit("Kraft Macaroni & Cheese", "Kraft"),
        _hit("Jif Creamy Peanut Butter", "Jif"),
        _hit("Welch's Grape Jelly", "Welch's"),
    ]

    async def finder(query, pantry=None):
        found = pick_live_product(query, hits, pantry)
        if not found:
            return {"status": "not_found", "query": query}
        return {"status": "found", "query": query, "product": found}

    seed = [{"_id": "seed-milk", "name": "Whole Milk", "prices": {"Store A": 1.0}}]
    ctx = PersonalContext(
        seed, [], {"items": [], "skipped": []}, {"weekly_budget": 60}, "u", "Maya", finder=finder)
    added = asyncio.run(personal_fallback(
        "add oreos, milk, eggs, bananas, bread, and mac and cheese to my list", ctx))
    names = [line["name"] for line in added["list"]["items"]]
    assert names == [
        "Oreo Chocolate Sandwich Cookies",
        "Kroger Vitamin D Whole Milk",
        "Large Brown Eggs",
        "Bananas",
        "Sara Lee White Sandwich Bread",
        "Kraft Macaroni & Cheese",
    ]
    assert all(line["product_id"] != "seed-milk" for line in added["list"]["items"])
    assert added["list"]["items"][0]["product_id"] == "Oreo Chocolate Sandwich Cookies"

    again = asyncio.run(personal_fallback("add oreos to my list", ctx))
    oreo = next(line for line in again["list"]["items"] if "Oreo" in line["name"])
    assert oreo["quantity"] == 2 and oreo["product_id"] == "Oreo Chocolate Sandwich Cookies"

    removed = asyncio.run(personal_fallback("remove oreos", ctx))
    assert all("Oreo" not in line["name"] for line in removed["list"]["items"])

    both = asyncio.run(personal_fallback("add peanut butter and jelly to my list", ctx))
    both_names = [line["name"] for line in both["list"]["items"]]
    assert "Jif Creamy Peanut Butter" in both_names and "Welch's Grape Jelly" in both_names

    async def down(query, pantry=None):
        return {"status": "unavailable", "query": query}

    offline = PersonalContext(
        seed, [], {"items": [], "skipped": []}, {"weekly_budget": 60}, "u", "Maya", finder=down)
    missed = asyncio.run(personal_fallback("add milk to my list", offline))
    assert missed["list"]["count"] == 0 and "Kroger" in missed["reply"]


def test_clear_personal_list_and_quantity():
    cart = {"items": [
        {"product_id": "milk", "name": "Whole Milk", "quantity": 2, "store": "QFC", "price": 3.49},
        {"product_id": "eggs", "name": "Large Eggs", "quantity": 1, "store": "QFC", "price": 2.99},
    ], "skipped": [{"name": "Bread", "pantry_name": "Bread"}]}
    cleared, result = clear_personal_list(cart)
    assert result == {"action": "cleared", "removed": 2}
    assert cleared == {"items": [], "skipped": []}
    empty, again = clear_personal_list(cleared)
    assert again["removed"] == 0 and empty["items"] == []
    updated, gone = set_personal_list_quantity(cart, "milk", 0)
    assert gone["action"] == "removed"
    assert [line["product_id"] for line in updated["items"]] == ["eggs"]
    updated, bumped = set_personal_list_quantity(cart, "eggs", 3)
    eggs = next(line for line in updated["items"] if line["product_id"] == "eggs")
    assert eggs["quantity"] == 3
    assert any(line["product_id"] == "milk" for line in updated["items"])


def test_merge_personal_lists_sums_quantity():
    primary = {"items": [{"product_id": "milk", "name": "Milk", "quantity": 1, "price": 3}], "skipped": []}
    other = {"items": [
        {"product_id": "milk", "name": "Milk", "quantity": 2, "price": 3},
        {"product_id": "eggs", "name": "Eggs", "quantity": 1, "price": 2},
    ], "skipped": []}
    merged = merge_personal_lists(primary, other)
    by_id = {line["product_id"]: line["quantity"] for line in merged["items"]}
    assert by_id == {"milk": 3, "eggs": 1}
    assert primary["items"][0]["quantity"] == 1


def test_personal_clear_phrases():
    items = [
        {"product_id": "milk", "name": "Kroger Vitamin D Whole Milk", "quantity": 1, "store": "QFC", "price": 3.49},
        {"product_id": "eggs", "name": "Large Brown Eggs", "quantity": 1, "store": "QFC", "price": 2.99},
    ]
    ctx = PersonalContext(
        [], [], {"items": [], "skipped": []}, {"weekly_budget": 60}, "u", "Maya")
    for phrase in ("clear my list", "remove my list", "delete the list", "empty my cart"):
        ctx.list = {"items": [dict(line) for line in items], "skipped": []}
        ctx.results = []
        out = asyncio.run(personal_fallback(phrase, ctx))
        assert out["list"]["items"] == [], phrase
        assert "Cleared 2 items" in out["reply"], out["reply"]
    ctx.list = {"items": [], "skipped": []}
    ctx.results = []
    empty = asyncio.run(personal_fallback("clear my list", ctx))
    assert "already empty" in empty["reply"].lower()
    ctx.list = {"items": [dict(line) for line in items], "skipped": []}
    ctx.results = []
    removed = asyncio.run(personal_fallback("remove milk", ctx))
    assert [line["name"] for line in removed["list"]["items"]] == ["Large Brown Eggs"]


def test_personal_pantry_from_imessage():
    milk = {"product_id": "milk", "name": "Kroger Vitamin D Whole Milk", "quantity": 1, "store": "QFC", "price": 3.49}
    eggs = {"product_id": "eggs", "name": "Large Brown Eggs", "quantity": 2, "store": "QFC", "price": 2.99}
    skipped = [{"name": "Bread", "pantry_name": "Bread"}]
    listed = {"items": [dict(milk), dict(eggs)], "skipped": [dict(skipped[0])]}

    assert parse_pantry_move("I want to add everything from my list to my pantry") == ("all", None)
    assert parse_pantry_move("add all of my list to my pantry") == ("all", None)
    assert parse_pantry_move("add my whole list to my pantry") == ("all", None)
    assert parse_pantry_move("I want to add something to my pantry") == ("ask", None)
    assert parse_pantry_move("add oat milk to my pantry") == ("one", "oat milk")
    assert parse_add_queries("add oat milk to my pantry") == []
    assert parse_add_queries("I want to add everything from my list to my pantry") == []
    assert parse_add_queries("add milk to my list") == ["milk"]

    async def boom(query, pantry=None):
        raise AssertionError(query)

    ctx = PersonalContext(
        [], [], listed, {"weekly_budget": 60}, "u", "Maya", finder=boom)
    for phrase in (
        "I want to add everything from my list to my pantry",
        "add all of my list to my pantry",
        "add my whole list to my pantry",
    ):
        ctx.list = {"items": [dict(milk), dict(eggs)], "skipped": [dict(skipped[0])]}
        ctx.pantry = []
        ctx.results = []
        out = asyncio.run(personal_fallback(phrase, ctx))
        assert [line["name"] for line in ctx.pantry] == [
            "Kroger Vitamin D Whole Milk", "Large Brown Eggs"], phrase
        assert ctx.pantry[1]["quantity"] == 2 and ctx.pantry[0]["product_id"] == "milk"
        assert ctx.list["items"] == [] and ctx.list["skipped"] == skipped
        assert "Added 2 items from your list to your pantry" in out["reply"]
        assert out["list"]["items"] == []

    ctx.list = {"items": [], "skipped": [dict(skipped[0])]}
    ctx.pantry = []
    ctx.results = []
    empty = asyncio.run(personal_fallback("I want to add everything from my list to my pantry", ctx))
    assert empty["reply"] == "Your list is already empty."
    assert ctx.pantry == [] and ctx.list["skipped"] == skipped

    ctx.list = {"items": [dict(milk), dict(eggs)], "skipped": []}
    ctx.pantry = []
    ctx.results = []
    one = asyncio.run(personal_fallback("I want to add eggs to my pantry", ctx))
    assert [line["name"] for line in ctx.list["items"]] == ["Kroger Vitamin D Whole Milk"]
    assert ctx.pantry[0]["name"] == "Large Brown Eggs" and ctx.pantry[0]["quantity"] == 2
    assert "Moved 2 Large Brown Eggs from your list to your pantry." in one["reply"]

    held = [{"_id": "p1", "name": "Whole Milk", "quantity": 1, "unit": "jug", "expires_at": "soon"}]
    ctx.list = {"items": [], "skipped": []}
    ctx.pantry = [dict(held[0])]
    ctx.results = []
    again = asyncio.run(personal_fallback("add milk to my pantry", ctx))
    assert len(ctx.pantry) == 1
    assert ctx.pantry[0]["_id"] == "p1" and ctx.pantry[0]["expires_at"] == "soon"
    assert ctx.pantry[0]["quantity"] == 2 and ctx.pantry[0]["unit"] == "jug"
    assert "Updated Whole Milk" in again["reply"]
    assert ctx.list["items"] == []

    catalog = [prod("Oat Milk", "dairy_eggs", 3, {"Store A": 4.29})]
    ctx = PersonalContext(
        catalog, [], {"items": [], "skipped": []}, {"weekly_budget": 60}, "u", "Maya", finder=boom)
    added = asyncio.run(personal_fallback("add oat milk to my pantry", ctx))
    assert ctx.pantry[0]["name"] == "Oat Milk" and ctx.pantry[0]["product_id"] == "Oat Milk"
    assert ctx.pantry[0]["quantity"] == 1 and ctx.list["items"] == []
    assert added["reply"] == "Added Oat Milk to your pantry."

    ctx.results = []
    bumped = asyncio.run(personal_fallback("add oat milk to my pantry", ctx))
    assert len(ctx.pantry) == 1 and ctx.pantry[0]["quantity"] == 2
    assert "Updated Oat Milk" in bumped["reply"]

    ctx.list = {"items": [dict(milk)], "skipped": []}
    before = [dict(line) for line in ctx.pantry]
    ctx.results = []
    asked = asyncio.run(personal_fallback("I want to add something to my pantry", ctx))
    assert asked["reply"] == "Which item should I add to your pantry?"
    assert ctx.list["items"][0]["name"] == milk["name"]
    assert ctx.pantry == before

    async def finder(query, pantry=None):
        return {"status": "found", "product": {
            "_id": "milk-upc", "name": "Whole Milk", "prices": {"Store A": 3.49}}}

    shopping = PersonalContext(
        [], [], {"items": [], "skipped": []}, {"weekly_budget": 60}, "u", "Maya", finder=finder)
    listed_out = asyncio.run(personal_fallback("add milk", shopping))
    assert [line["name"] for line in listed_out["list"]["items"]] == ["Whole Milk"]
    assert shopping.pantry == []

    cart, pantry, result = move_personal_list_to_pantry(
        {"items": [], "skipped": skipped}, held)
    assert result["action"] == "empty" and pantry == held
    cart, pantry, result = add_spoken_personal_pantry_item(
        {"items": [dict(milk)], "skipped": []}, [], "milk", [])
    assert cart["items"] == [] and pantry[0]["product_id"] == "milk"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
