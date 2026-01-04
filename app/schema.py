# app/schema.py
from pydantic import BaseModel, Field
from typing import Optional, List, Literal

# NOTE: Fields match the features used in your pipelines.
class Features(BaseModel):
    Junction: int = Field(..., ge=1)
    Vehicles: float
    Vehicles_lag1: float
    Vehicles_lag2: float
    Vehicles_lag3: float
    Vehicles_lag6: float
    Vehicles_lag24: float
    roll3_mean: float
    roll24_mean: float
    hour: int = Field(..., ge=0, le=23)
    dayofweek: int = Field(..., ge=0, le=6)
    is_weekend: int = Field(..., ge=0, le=1)

class PredictClassResponse(BaseModel):
    congestion: Literal["Low","Medium","High"]
    confidence: Optional[float] = None

class PredictRegResponse(BaseModel):
    vehicles_t_plus_1: float

class PredictBothResponse(BaseModel):
    congestion: Literal["Low","Medium","High"]
    confidence: Optional[float] = None
    vehicles_t_plus_1: float

class BatchRequest(BaseModel):
    rows: List[Features]

