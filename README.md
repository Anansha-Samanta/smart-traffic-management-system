# Traffic ML App

FastAPI backend serving:
- `/predict_classification` → Low/Medium/High
- `/predict_regression` → next-hour Vehicles
- `/predict_both` → both in one call
- `/health`, `/meta`

## Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
