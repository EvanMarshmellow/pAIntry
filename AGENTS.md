# pAIntry agent map

Grocery assistant (working name Cartwise) for DubHacks '26, Visa track. The engine decides Buy / Skip / Swap, prices, savings, catalog matches, pantry skips, and group-cart merges. Gemini only writes the words. New iMessage shopping-list lines use live Kroger prices (UPC, nearby store). Convince Me uses Kroger for a live query and the seeded catalog otherwise. Receipt matching and pantry food groups still use seeded sample prices. Checkout and payments are not built. There is no weekly recap Gemini route yet.

The root [README.md](README.md) is the product pitch. It lists Expo, Perceptron, voice, and a Gemini recap that are **not in the repo**. Photon iMessage **is** in the repo: 1:1 DMs → `POST /agent/personal`, group chats → `POST /agent/message` (see [`photon-agent/`](photon-agent/)). Trust this file and `backend/` for what exists.

## Where to edit

Work in [`backend/`](backend/) and [`photon-agent/`](photon-agent/). Run Python from `backend/`.

[`backend/backend/`](backend/backend/) is a duplicate of the same app. Do not edit it. If the two trees disagree, `backend/` wins.

Not implemented: Expo `app/`, Perceptron scan, voice session, nutrition-gap list, cost split, mock Visa checkout.

## Layout

| Path | Role |
|---|---|
| [backend/app/main.py](backend/app/main.py) | FastAPI routes. Loads user, product, pantry, week spend, household cart; calls the engine, Gemini, and the chat agent. |
| [backend/app/engine.py](backend/app/engine.py) | All math. No HTTP, no model imports. Convince Me plus group-cart and personal-list helpers. |
| [backend/app/convince.py](backend/app/convince.py) | Explains Convince Me engine facts (via Gemini). `postprocess` overwrites the model's numbers. Missing key, timeout, or bad JSON falls back to the engine (`"source": "engine"`). |
| [backend/app/gemini.py](backend/app/gemini.py) | OpenAI-compatible Gemini chat client (`GEMINI_API_KEY`, `GEMINI_MODEL`). |
| [backend/app/agent.py](backend/app/agent.py) | iMessage group-cart tool loop. Tools call the engine. Regex fallback if Gemini is down. |
| [backend/app/personal_agent.py](backend/app/personal_agent.py) | 1:1 DM grocery planner. Personal list, budget, expiring, evaluate. Regex fallback if Gemini is down. |
| [backend/app/perceptron_ocr.py](backend/app/perceptron_ocr.py) | Receipt OCR via Perceptron Mk1.5 (`PERCEPTRON_API_KEY`). |
| [backend/app/receipt_flow.py](backend/app/receipt_flow.py) | Receipt session state machine: pantry confirm → optional swap suggestions → buy / ignore. |
| [backend/app/receipt_agent.py](backend/app/receipt_agent.py) | Wires OCR + sessions into `/agent/personal` and `/agent/message`. |
| [backend/app/db.py](backend/app/db.py) | Motor client, database name, collection list, indexes. |
| [backend/seed.py](backend/seed.py) | Drops every collection and inserts sample products and Maya's personal pantry. Group households are created by the first `/agent/message` for a `space_id`, not by seed. |
| [backend/test_engine.py](backend/test_engine.py) | Offline tests. No database and no API key. |
| [backend/.env.example](backend/.env.example) | `MONGODB_URI`, `DB_NAME`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `PERCEPTRON_API_KEY`. Photon vars belong in `photon-agent/.env`. |
| [photon-agent/index.js](photon-agent/index.js) | Spectrum webhook sidecar. Routes iMessage `dm` → `/agent/personal`, `group` → `/agent/message`. Sends the reply with `space.send()`. Does not parse groceries. |

## Run

From `backend/` on Windows:

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python seed.py
uvicorn app.main:app --reload
python test_engine.py
```

Photon sidecar (separate terminal, after the API is up):

```powershell
cd photon-agent
copy .env.example .env
npm install
npm start
```

Docs: http://localhost:8000/docs

`python seed.py` prints Maya's id. It is always `665f00000000000000000001`. Alex is `665f00000000000000000002`. Household is `665f00000000000000000010`.

**1:1 DMs** work on shared-pool or Business lines. **Group** iMessage needs a Photon **Business dedicated line**; shared-pool lines cannot send to groups. Register a public HTTPS URL (tunnel) as the Spectrum webhook: `POST /spectrum/webhook` on port 3000.

## HTTP

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Pings Mongo. |
| `GET` | `/products?category=` | Sample catalog. |
| `GET` | `/users/{id}` | Profile, budget, allergies, goals, `phone`. |
| `GET` | `/users/{id}/pantry` | Sorted by `expires_at`. |
| `GET` | `/users/{id}/pantry/food-groups` | Classic pyramid mix (calorie % primary vs 30/25/20/15/10 targets). No writes. |
| `POST` | `/users/{id}/pantry` | Body: `name`, optional `quantity`, `unit`, `product_id`, `expires_at`. |
| `DELETE` | `/users/{id}/pantry/{item_id}` | Remove one pantry line for that user. |
| `GET` | `/users/{id}/savings` | Sum of `savings_ledger.amount` for that user. |
| `POST` | `/convince-me` | Body: `user_id` plus `product_id`, `barcode`, or `query`. `log: false` (or `?log=false`) skips writes. |
| `POST` | `/agent/message` | Group iMessage (or curl). Mutates that group's `group_carts` and `group_pantry_items`. |
| `POST` | `/agent/personal` | 1:1 DM (or curl). Mutates `personal_lists`. Unknown phone gets a signup message (no Maya default). Optional `image_base64` + `image_mime_type` for receipt OCR. |
| `POST` | `/users/{id}/pantry/receipt` | Debug receipt flow with JSON `ocr` fixture (no image). |
| `GET` | `/users/{id}/list` | Personal shopping list summary. |
| `GET` | `/households/{id}/cart` | Current group cart for that household. |
| `GET` | `/households/{id}/pantry` | That group's pantry only. Does not include member `pantry_items`. |

### Convince Me

`/convince-me` returns the card, the raw `engine` facts, and `logged`. A name query is a case-insensitive regex on `products.name`.

```powershell
curl -X POST http://localhost:8000/convince-me -H "Content-Type: application/json" -d "{\"user_id\":\"665f00000000000000000001\",\"query\":\"protein bar chocolate\"}"
```

Expected: **Swap** to Greek Yogurt Cup Vanilla at Store B, save **$2.20**, then a `savings_ledger` row. `"peanut butter crunch"` is **Skip** because Maya is allergic to peanuts.

### Group cart and group pantry (`POST /agent/message`)

Body: `{ "space_id", "sender", "text", "message_id?" }`. `sender` is a phone. Unknown numbers are allowed: `user_id` in the response is null, and cart `requesters` / pantry `added_by` store the phone. Do not substitute Maya.

The first message for a `space_id` creates a household bound to that `space_id` only. A later message in a different group creates a different household and an empty pantry. Never attach a new `space_id` to a household the sender already belongs to, and never take the first household in the database.

Two stores, chosen by phrasing:

- Shopping list (`group_carts`): `add`, `need`, `put on the list`, `what's on the list`. Skip only when **this group's** pantry already has a name match. List adds search Kroger stores nearest the sender's `zip` (or `DEFAULT_ZIP`). `product_id` is the UPC. They do not match the seeded `products` collection. A miss says it was not found at nearby stores. If Kroger cannot be reached, the item is not added.
- Group pantry (`group_pantry_items`): `add to the pantry`, `put in the pantry`, `we have`, `used`, `finished`, `move`, `remove from the pantry`. `move X to the pantry` / `we bought X` takes a list line into the group pantry (or adds it if it was not on the list). `used` / `finished` / `move X out` decrements quantity and deletes the line at 0. `we have 2 X` sets quantity.

A plain `add milk` stays on the shopping list. This route never reads or writes `pantry_items`, `personal_lists`, or `users`. Personal 1:1 pantries stay on `/agent/personal`.

Replies for grocery intent (list phrases above, pantry phrases, `@cartwise`). Other chat returns `"ignored": true` and `"reply": null` so Photon does not send.

Returns `{ "reply", "cart", "pantry", "source": "gemini"|"engine", "ignored", "logged", "space_id", "user_id", "household_id" }`. Cart prices always come from the engine.

```powershell
curl -X POST http://localhost:8000/agent/message -H "Content-Type: application/json" -d "{\"space_id\":\"apt\",\"sender\":\"+15555550101\",\"text\":\"add milk to the pantry\"}"
```

That writes `group_pantry_items` for `apt` only. `we need milk` then skips because the group pantry has milk. `add milk` with an empty group pantry searches Kroger and adds the matched milk with its live store and price. A second `space_id` does not see those lines. `GET /households/{id}/pantry` reads the group pantry. Group pantry writes still keep the spoken name and do not call Kroger.

Gemini tools (engine JSON only): `get_pantry`, `resolve_product`, `add_cart_item`, `get_cart`, `add_pantry_item`, `set_pantry_quantity`, `remove_pantry_item`, `move_to_pantry`. Missing key / timeout / bad JSON uses regex parsing in [backend/app/agent.py](backend/app/agent.py). Pantry phrases must not fall through to `add_to_group_cart`.

### Personal DM (`POST /agent/personal`)

Body: `{ "space_id", "sender", "text", "message_id?", "space_type?" }`. `sender` is E.164 (`+15555550101` Maya). **Only registered phones** are accepted; unknown senders get a short engine reply and no DB writes.

Replies for grocery planning intent (list add/show, budget, expiring, `should I buy …`, etc.). Casual chat → `"ignored": true`, `"reply": null`.

Returns `{ "reply", "list", "source": "gemini"|"engine", "ignored", "logged", "space_id", "user_id" }`. List prices always come from the engine. Personal list is **not** synced to `group_carts`.

```powershell
curl -X POST http://localhost:8000/agent/personal -H "Content-Type: application/json" -d "{\"space_id\":\"any;-;+15555550101\",\"sender\":\"+15555550101\",\"text\":\"what's expiring and add hummus to my list\"}"
```

Gemini tools: `get_pantry`, `get_budget_status`, `get_expiring`, `resolve_product`, `add_list_item`, `remove_list_item`, `get_list`, `evaluate_product`. Fallback regex in [backend/app/personal_agent.py](backend/app/personal_agent.py). List adds search Kroger the same way as the group list. `product_id` on new lines is the UPC. `remove oreos` matches those words against list line names. `should I buy` still uses the seeded catalog.

### Receipt photo (DM or group)

Send an **image** over iMessage (Photon sidecar) or POST `image_base64` + `image_mime_type` to `/agent/personal` or `/agent/message`. Requires `PERCEPTRON_API_KEY`. Flow is stored in `receipt_sessions` (TTL 24h) per `(user_id, space_id)`:

1. OCR line items → reply **yes** to add them. A 1:1 DM writes that user's `pantry_items`. A group chat writes `group_pantry_items` for that `space_id` (session key `group:{space_id}`, so anyone in the chat can confirm). Group receipts do not update `users`, `pantry_items`, or `personal_lists`.
2. Reply **yes** or **skip** for habit suggestions (engine Swap facts on catalog-matched lines).
3. Reply **buy** to add swap alternatives to the personal list (DM) or the group list (group), or **ignore suggestion** to finish.

While a session is open, text in that chat is handled by the receipt flow (not grocery intent regex).

Debug without Perceptron:

```powershell
curl -X POST http://localhost:8000/users/665f00000000000000000001/pantry/receipt -H "Content-Type: application/json" -d "{\"ocr\":{\"items\":[{\"product\":\"Protein Bar Chocolate\",\"price\":\"$3.49\"}]}}"
```

Then continue via `/agent/personal` with the same `space_id` as in the fixture (`debug` by default): `yes` → `yes` → `buy`.

Tests: `python test_receipt_flow.py`

## Data

Database name defaults to `app`. Collections in [backend/app/db.py](backend/app/db.py):

| Collection | Used for |
|---|---|
| `users` | Maya (`weekly_budget` 60, `allergies` `["peanuts"]`, `phone` `+15555550101`) and Alex (`weekly_budget` 50, no allergies, `phone` `+15555550102`). |
| `households` | One document per group `space_id`, created on the first `/agent/message` for that chat. `members` lists registered user ids who have spoken. `phones` lists every sender, including unregistered numbers. |
| `products` | ~49 items including **Tortilla Chips**. `prices` is `{ "Store A", "Store B", "Store C" }`. Nutrition is per serving. `barcode` is fake (`0000…`). `sample_data: true`. |
| `pantry_items` | Personal pantry. `user_id` is the **string** form of the user id, not an ObjectId. Group chat does not read or write this collection. |
| `group_pantry_items` | One group's pantry, keyed by `space_id` and `household_id`. No `user_id`. |
| `carts` | Read by `/convince-me` for spend in the last 7 days (`total`). Seed leaves this empty, so week spend is 0. |
| `decisions` | One document per logged `/convince-me` call. |
| `savings_ledger` | Written only when the final Convince Me verdict is Swap and `savings > 0`. |
| `group_carts` | One doc per Photon group `space_id` (use `"demo"` when curling). Written by `/agent/message`. |
| `personal_lists` | One doc per `user_id`. Written by `/agent/personal`. Separate from group cart. |
| `receipt_sessions` | In-progress receipt OCR flow per `(user_id, space_id)`. |

`group_carts` shape:

```json
{
  "space_id": "demo",
  "household_id": "665f00000000000000000010",
  "items": [{
    "product_id": "…",
    "name": "Hummus Classic",
    "quantity": 1,
    "requesters": ["665f00000000000000000002", "665f00000000000000000001"],
    "store": "Store B",
    "price": 3.49
  }],
  "skipped": [{ "name": "Whole Milk", "pantry_name": "Whole Milk", "requester": "665f00000000000000000001" }]
}
```

`personal_lists` shape:

```json
{
  "user_id": "665f00000000000000000001",
  "items": [{
    "product_id": "…",
    "name": "Hummus Classic",
    "quantity": 1,
    "store": "Store B",
    "price": 3.49
  }],
  "skipped": [{ "name": "Whole Milk", "pantry_name": "Whole Milk" }]
}
```

Seed products live in the `P` list in [backend/seed.py](backend/seed.py), not in JSON files. Categories include `dairy_eggs`, `meat_seafood`, `protein_alt`, `pantry`, `bakery`, `produce`, `frozen`, `snacks`, `breakfast`, `beverages`.

## Verdict rules (Convince Me)

`analyze()` in [backend/app/engine.py](backend/app/engine.py) returns facts plus `draft_verdict` and `draft_reason`. Order:

1. **Skip** if an allergy string appears in the product name, brand, ingredients, or allergens.
2. **Skip** if a pantry item name contains the product name, or the product name contains the pantry name, or the **categories match**.
3. **Swap** if a same-category product is cheaper at its cheapest store. Prefer the one with an equal or better cost per gram of protein. Savings are `current cheapest price - alternative cheapest price`.
4. **Skip** if the cheapest price is above `weekly_budget - week_spent`.
5. **Buy** otherwise.

`protein_per_pkg` is `protein_g * servings`. Seed rows omit `servings`, so the multiplier is 1 and "per package" is the per-serving value.

Gemini may suggest copy. [backend/app/convince.py](backend/app/convince.py) `postprocess` forces Skip on allergy conflicts, copies savings and the alternative from the engine, and replaces vague reasons with numeric engine reasons. Do not let a prompt or model response become the source of a price.

## Group cart rules

Do **not** reuse `in_pantry()` for adds. Category match would skip "hummus" because Maya has granola in a different aisle, or skip a new dairy item because she has eggs. Use these engine helpers instead:

1. `resolve_product(query, products, pantry=None)` — case-insensitive exact / whole-word / substring match. If several catalog hits, prefer one that `pantry_name_match`s so `add milk` resolves to Whole Milk and can skip.
2. `pantry_name_match(product, pantry)` — pantry name in product name, or product name in pantry name. **No category.**
3. `add_to_group_cart(cart, product, user_id, pantry)` — pantry hit → append `skipped`, do not add; same `product_id` → append requester; else insert with `cheapest()` store and price.
4. `cart_summary(cart)` — lines, skipped, `total` (sum of cheapest prices). No equal-split math.
5. `add_group_pantry_item`, `remove_group_pantry_item`, `set_group_pantry_quantity`, `move_cart_line_to_group_pantry` — mutate a group pantry list. They do not accept a user pantry. Pass `pantry=None` into `resolve_product` when the destination is the group pantry. The list passed into `add_to_group_cart` is the group pantry only.

Shopping-list adds do not call `resolve_product` on the seeded catalog. `search_for_list` in [backend/app/kroger.py](backend/app/kroger.py) searches nearby stores, `to_engine` shapes each hit, and `pick_live_product` chooses one. The picker handles ordinary grocery wording: plurals (`oreos`, `tomatoes`, `berries`), brand plus name, squeezed compounds (`oat milk` / `oatmilk`), and spoken names (`coke`, `oj`, `mayo`, `pb`, `mac and cheese`, `tin foil`). A bare staple prefers the plain item when a flavored one is in the same hit list (`milk` prefers whole milk over almond milk) unless a pantry name overlaps a specific hit. A repeat add of the same retail name bumps quantity instead of inserting another size. `mac and cheese` stays one item; `peanut butter and jelly` is two.

## Personal list rules

Same name matching as group cart (`resolve_product`, `pantry_name_match`), but persistence is per user and duplicate `product_id` **bumps quantity** instead of merging requesters:

1. `add_to_personal_list(cart, product, pantry)` — pantry hit → `skipped`; else append or increment quantity with `cheapest()` store/price. iMessage adds go through `add_live_product`, which bumps a matching retail line first.
2. `remove_from_personal_list(cart, product_id)` — drop line or `not_found`. Spoken removes use `list_line_for_query` so `oreos` matches an Oreo line.
3. `cart_summary(cart)` — same totals helper as group cart.

## Demo users

Maya's pantry (days until expiry, from seed time): spinach 1, plain Greek yogurt 2, whole milk 2, chicken breast 3, bananas 4, eggs 9, cheddar 21, granola 60, rice 365, black beans 540. Items expiring within 3 days are attached in `main.py` as `expiring_soon` before Convince Me `explain()` runs. The engine itself does not compute expiry.

A group pantry starts empty. It is not the union of member pantries. Maya's personal pantry does not change when she, or an unknown phone, stocks the group pantry.

## Photon sidecar

[`photon-agent/`](photon-agent/) uses `spectrum-ts` + `@spectrum-ts/express`. Env: `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `SPECTRUM_WEBHOOK_SECRET`, `BACKEND_URL`. FastAPI never calls Photon. For iMessage, `imessage(space).type === "dm"` routes to `/agent/personal`; otherwise `/agent/message`. The sidecar ignores non-text, outbound echoes, and duplicate `message.id`. If FastAPI is down it sends "Cartwise is offline — try again in a minute." It does not guess cart contents.

## Not built

Do not add these unless asked: Expo app, Perceptron scan, voice session, nutrition-gap shopping list, group-cart cost split, mock Visa checkout, weekly recap.

Planned routes in the root README (`/convince`, `/pantry/scan`, `/list`, `/voice/session`, `/ledger`) are not the live API. The live convince route is `POST /convince-me`. Group chat is `POST /agent/message`; 1:1 DM is `POST /agent/personal`. Personal list read is `GET /users/{id}/list`. Savings: `GET /users/{id}/savings`.
