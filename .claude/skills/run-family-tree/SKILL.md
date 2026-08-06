---
description: Launch the Family Tree app locally — FastAPI backend on port 8001 and Vite frontend on port 5173 — then open the browser.
---

# Run Family Tree Locally

Start the FastAPI backend and Vite dev server, then open the app in the browser.

## Steps

### 1. Install backend dependencies

```bash
cd "c:\Users\amoli\Desktop\Projects\FamilyTree\backend"
pip install -r requirements.txt -q
```

### 2. Start the backend (port 8001)

```bash
cd "/c/Users/amoli/Desktop/Projects/FamilyTree/backend"
uvicorn main:app --port 8001 &
```

Wait ~3 seconds, then verify it loaded:

```bash
sleep 3 && curl -s http://localhost:8001/api/people | python -c "import sys,json; d=json.load(sys.stdin); print(f'Backend OK — {len(d)} people loaded')"
```

### 3. Start the Vite frontend (port 5173)

Node is not on the Bash PATH — use the full path to node.exe:

```bash
NODE="/c/Users/amoli/AppData/Local/node/node-v20.19.2-win-x64/node.exe"
VITE="/c/Users/amoli/Desktop/Projects/FamilyTree/frontend/node_modules/vite/bin/vite.js"
cd "/c/Users/amoli/Desktop/Projects/FamilyTree/frontend"
"$NODE" "$VITE" &
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

A `200` response confirms Vite is up.

### 4. Open the browser

```bash
start http://localhost:5173
```

## Ports

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8001      |
| API docs | http://localhost:8001/docs |

## Notes

- The backend serves the GEDCOM from `FamilyTree/FamilyTree.ged` — it must exist at that path.
- `npm run dev` does not work from Bash because `node` is not on the Bash PATH. Always invoke `node.exe` and `vite.js` directly as shown above.
- If port 8001 or 5173 is already in use, kill the existing process before starting.
