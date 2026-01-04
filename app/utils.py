# app/utils.py
import pandas as pd
from typing import List
from .schema import Features

FEATURE_ORDER = [
    "Vehicles",
    "Vehicles_lag1","Vehicles_lag2","Vehicles_lag3","Vehicles_lag6","Vehicles_lag24",
    "roll3_mean","roll24_mean",
    "hour","dayofweek","is_weekend",
    "Junction",
]

def to_dataframe_one(feat: Features) -> pd.DataFrame:
    d = {k: getattr(feat, k) for k in FEATURE_ORDER}
    return pd.DataFrame([d], columns=FEATURE_ORDER)

def to_dataframe_batch(items: List[Features]) -> pd.DataFrame:
    rows = []
    for it in items:
        rows.append({k: getattr(it, k) for k in FEATURE_ORDER})
    return pd.DataFrame(rows, columns=FEATURE_ORDER)
