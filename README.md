# pAIntry

> An AI grocery assistant that knows your kitchen, your body, and your budget.
> It tells you what to buy, where to buy it, and whether a product is worth it.

*Built at DubHacks '26 · Track: **Visa — Reimagine Shopping** · "Cartwise" is a working name.*

---

## What it does

| Feature | What happens |
|---|---|
| **Convince Me** | Scan or name a product and get a **Buy / Skip / Swap** card with reasons, a better alternative, and the dollars you'd save. Works by voice in the store. |
| **Pantry capture** | Text or upload a receipt or fridge photo. Vision AI finds the items (and expiry dates), and you confirm them. |
| **Smart shopping list** | Nutrition gaps become a budget-aware list, with prices compared across 3 stores. |
| **Group cart** | In a roommate iMessage chat, Cartwise merges everyone's requests, removes duplicates, and splits the cost. |
| **Money saved** | A ledger of swaps and rescued food, plus a weekly recap text. |

### Trust principles
- **Code does the math, the LLM writes the words.** Verdicts, prices, savings, and splits are computed deterministically. Models only explain them.
- **"Why this?"** Every reason on a card links back to the data it came from.
- **Private health data.** Health info stays in our database and is never used to train models.
- **Not medical advice.** Cartwise gives general nutrition info only.

---

## Demo flow (< 3 min)

1. Text a fridge photo over iMessage (Photon). Perceptron finds the items and an expiry date.
2. A nutrition gap becomes a recommended cart, with the cheapest store for each item.
3. In the group chat, a roommate adds items, duplicates are removed, and the cost is split.
4. In store, by voice: *"Is this worth it?"* returns a **SWAP** card with savings and "Why this?"
5. Mock one-tap pay + loyalty points end with a *"Saved $X this week"* recap.

---

## Architecture

```
 Expo app (React Native) ─┐
                          ├──► FastAPI backend ──► MongoDB Atlas
 iMessage / SMS ─► Photon │        │
     Node sidecar ────────┘        ├─ deterministic engine (scores, prices, savings, splits)
                                   └─ ai/
                                       ├─ grok.py     Grok: structured cards + agent tool loop
                                       ├─ vision.py   Perceptron: receipt OCR, fridge detection
                                       ├─ voice.py    Grok Voice realtime session + tools
                                       ├─ imagine.py  Grok Imagine (pre-generated assets)
                                       └─ recap.py    Gemini weekly recap
```

All model calls go through the backend, so API keys never reach the client.

### Stack

| Layer | Choice |
|---|---|
| App | React Native (Expo) |
| Backend | FastAPI (Python) |
| Database | MongoDB Atlas |
| LLM | Grok (tool calling + JSON schema outputs) |
| Voice | Grok Voice (realtime WebSocket) |
| Images | Grok Imagine |
| Vision / OCR | Perceptron |
| Messaging | Photon 2.0 (iMessage, SMS fallback) via a Node sidecar |
| Data | Open Food Facts + USDA FoodData Central; seeded prices (40–60 items × 3 stores) |

---

## Repo layout

```
cartwise/
├── app/            # Expo app: screens, Convince Me card, cart, checkout
├── backend/
│   ├── main.py     # FastAPI entrypoint
│   ├── engine/     # deterministic scoring, pricing, savings, cost split
│   ├── ai/         # model integrations (see Architecture)
│   ├── db/         # Atlas schema + seed scripts
│   └── fixtures/   # cached AI responses for demo mode
├── photon-agent/   # Node sidecar bridging Photon to the backend
└── data/           # seed price data, product samples
```

---

## Getting started

### Prerequisites
- Node 20+, Python 3.11+
- Expo Go on your phone
- A MongoDB Atlas cluster
- API keys: xAI, Perceptron, Photon

### Environment
Create `backend/.env`:

```bash
MONGODB_URI=mongodb+srv://...
XAI_API_KEY=
GROK_MODEL=            # check the xAI console for the current model id
GROK_VOICE_MODEL=grok-voice-latest
PERCEPTRON_API_KEY=
DEMO_MODE=false        # true = serve cached AI responses from fixtures/
```

Create `photon-agent/.env`:

```bash
PHOTON_PROJECT_ID=
PHOTON_PROJECT_SECRET=
BACKEND_URL=http://localhost:8000
```

### Run

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m db.seed          # load products + prices into Atlas
uvicorn main:app --reload

# Photon sidecar
cd photon-agent
npm install && npm start

# App
cd app
npm install && npx expo start
```

---

## Key API endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/convince` | Product name or barcode in, Buy/Skip/Swap card out |
| `POST` | `/pantry/scan` | Receipt or fridge image in, candidate items out |
| `POST` | `/pantry/confirm` | Save the confirmed items |
| `GET` | `/list` | Budget-aware shopping list with the cheapest store per item |
| `POST` | `/agent/message` | Inbound chat message from the Photon sidecar, reply out |
| `POST` | `/voice/session` | Mint a short-lived token for Grok Voice |
| `GET` | `/ledger` | Savings ledger and weekly totals |

---

## Team

| Role | Owns |
|---|---|
| Frontend | Expo screens, Convince Me card, cart, checkout |
| Backend / Data | Atlas schema, seed data, deterministic engine, savings ledger |
| AI | Grok prompts and tools, Voice, Imagine, Perceptron |
| Agent + Story | Photon agent, group cart, recap, Devpost, video, pitch |

---

## Limitations

- Store prices are **seeded sample data**, not live retailer prices.
- Checkout and loyalty points are **mocked**. No real payments are made.
- Nutrition guidance is general information, **not medical advice**.

## Acknowledgments

Open Food Facts · USDA FoodData Central · xAI · Perceptron · Photon · Google Gemini · MongoDB Atlas · DubHacks '26
