# app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import models  # << import the module, not individual names
from .schema import (
    Features,
    PredictClassResponse,
    PredictRegResponse,
    PredictBothResponse,
    BatchRequest,
)
from .utils import to_dataframe_one, to_dataframe_batch
from fastapi.responses import Response

app = FastAPI(title="Traffic Congestion API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)

@app.get("/")
def home():
    return {
        "message": "Traffic ML API",
        "try": ["/docs", "/health", "/meta",
                "/predict_classification", "/predict_regression", "/predict_both"]
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/meta")
def meta():
    try:
        models.ensure_loaded("clf")  # loads META too if present
    except Exception:
        pass
    return {
        "feature_order": list(models.META.get("feat_num", [])) + list(models.META.get("feat_cat", [])),
        "cut_date": models.META.get("cut_date"),
        "K_HIGH": models.META.get("K_HIGH"),
        "K_LOW": models.META.get("K_LOW"),
    }

@app.post("/predict_classification", response_model=PredictClassResponse)
def predict_classification(feat: Features):
    try:
        models.ensure_loaded("clf")
        X = to_dataframe_one(feat)
        y = models.clf.predict(X)[0]
        proba = None
        if hasattr(models.clf, "predict_proba"):
            try:
                proba = float(max(models.clf.predict_proba(X)[0]))
            except Exception:
                proba = None
        return {"congestion": str(y), "confidence": proba}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"classification failed: {e}")

@app.post("/predict_regression", response_model=PredictRegResponse)
def predict_regression(feat: Features):
    try:
        models.ensure_loaded("reg")
        X = to_dataframe_one(feat)
        y = float(models.reg.predict(X)[0])
        return {"vehicles_t_plus_1": y}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"regression failed: {e}")

@app.post("/predict_both", response_model=PredictBothResponse)
def predict_both(feat: Features):
    try:
        models.ensure_loaded("clf")
        X = to_dataframe_one(feat)
        cls_ = models.clf.predict(X)[0]
        conf = None
        if hasattr(models.clf, "predict_proba"):
            try:
                conf = float(max(models.clf.predict_proba(X)[0]))
            except Exception:
                pass
        models.ensure_loaded("reg")
        r = float(models.reg.predict(X)[0])
        return {"congestion": str(cls_), "confidence": conf, "vehicles_t_plus_1": r}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"both prediction failed: {e}")

@app.post("/predict_batch")
def predict_batch(req: BatchRequest):
    try:
        models.ensure_loaded("clf")
        models.ensure_loaded("reg")
        X = to_dataframe_batch(req.rows)
        cls_arr = models.clf.predict(X)
        reg_y = models.reg.predict(X)
        confs = None
        if hasattr(models.clf, "predict_proba"):
            try:
                confs = models.clf.predict_proba(X).max(axis=1)
            except Exception:
                pass
        out = []
        for i in range(len(X)):
            out.append({
                "congestion": str(cls_arr[i]),
                "confidence": None if confs is None else float(confs[i]),
                "vehicles_t_plus_1": float(reg_y[i]),
            })
        return {"results": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"batch failed: {e}")
