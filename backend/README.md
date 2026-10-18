# Grocery Assistant Backend (FastAPI + MongoDB Atlas)

## Atlas checklist
1. **Database Access**: add a database user (username + password).
2. **Network Access**: add `0.0.0.0/0` (allow from anywhere).
3. **Connect → Drivers → Python**: copy the `mongodb+srv://...` connection string.

## Run
1. `python -m venv venv && source venv/bin/activate` (Windows: `venv\Scripts\activate`)
2. `pip install -r requirements.txt`
3. `cp .env.example .env` and paste your connection string into `MONGODB_URI`
4. `python seed.py` (drops & reseeds sample data; prints Maya's user id)
5. `uvicorn app.main:app --reload` → open http://localhost:8000/docs

## Endpoints
`GET /health` · `GET /products?category=` · `GET /users/{id}` · `GET/POST /users/{id}/pantry` · `GET /users/{id}/savings` · `GET /users/{id}/list` · `POST /agent/personal` · `POST /agent/message` · `GET /households/{id}/cart`

All prices/products are **sample data**.

## Convince Me (Buy / Skip / Swap)
Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in `.env`. Without a key, or if Gemini errors or times out, you get the rule-based engine verdict (`"source": "engine"`).
All numbers (prices, savings) come from `app/engine.py`, never from the model.

Maya's id is fixed at `665f00000000000000000001` (after running `python seed.py`).

```bash
curl -X POST http://localhost:8000/convince-me -H "Content-Type: application/json" \
  -d '{"user_id":"665f00000000000000000001","query":"protein bar chocolate"}'
```
Expected: **Swap** → Greek Yogurt Cup Vanilla at Store B, saves $2.20, logged to `savings_ledger`.
Try `"query":"peanut butter crunch"` → **Skip** (peanut allergy). Body also accepts `product_id` or `barcode`.

Tests: `python test_engine.py`

## Group cart (Photon / curl)
Maya `+15555550101`, Alex `+15555550102`. Household id `665f00000000000000000010`. Without `GEMINI_API_KEY` the regex fallback still adds/skips/merges.

```bash
curl -X POST http://localhost:8000/agent/message -H "Content-Type: application/json" \
  -d '{"space_id":"demo","sender":"+15555550101","text":"add milk"}'
```

Expected: Skip Whole Milk (already in pantry). Photon sidecar: `cd photon-agent && npm start` (see repo `AGENTS.md`).

## Personal DM (1:1 iMessage / curl)

Maya `+15555550101`. Personal list is stored in `personal_lists` (not the household group cart). Photon routes DMs to `/agent/personal` automatically.

```bash
curl -X POST http://localhost:8000/agent/personal -H "Content-Type: application/json" \
  -d '{"space_id":"any;-;+15555550101","sender":"+15555550101","text":"what'\''s expiring and add hummus to my list"}'
```

```bash
curl http://localhost:8000/users/665f00000000000000000001/list
```
