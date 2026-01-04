# app/models.py
import json
from pathlib import Path
import joblib

BASE = Path(__file__).resolve().parent
MODELS_DIR = BASE / "models"

CLASSIFIER_PATH = MODELS_DIR / "classifier_rf.pkl"
REGRESSOR_PATH = MODELS_DIR / "regressor_rf.pkl"
META_PATH      = MODELS_DIR / "model_meta.json"

# Globals filled on first use
clf = None
reg = None
META = {}

def _load_joblib(path: Path, mmap: bool = True):
    """
    Load a joblib artifact. mmap_mode='r' reduces RAM spikes on large numpy arrays.
    """
    with open(path, "rb") as f:
        return joblib.load(f, mmap_mode="r" if mmap else None)

def ensure_loaded(which: str):
    """
    Lazy-load ONLY the requested model.
      which: 'clf' or 'reg'
    Also loads META once if present.
    """
    global clf, reg, META

    if which not in ("clf", "reg"):
        raise ValueError("ensure_loaded(which) must be 'clf' or 'reg'")

    if which == "clf" and clf is None:
        if not CLASSIFIER_PATH.exists():
            raise FileNotFoundError(
                f"Missing classifier file: {CLASSIFIER_PATH}. "
                "Copy outputs/classifier_rf.pkl from Colab to app/models/."
            )
        clf = _load_joblib(CLASSIFIER_PATH)

    if which == "reg" and reg is None:
        if not REGRESSOR_PATH.exists():
            raise FileNotFoundError(
                f"Missing regressor file: {REGRESSOR_PATH}. "
                "Copy outputs/regressor_rf.pkl from Colab to app/models/."
            )
        reg = _load_joblib(REGRESSOR_PATH)

    # Load META once (lightweight)
    if META == {} and META_PATH.exists():
        with open(META_PATH, "r", encoding="utf-8") as f:
            META = json.load(f)

def models_status():
    """Small helper you can call from endpoints if you want."""
    return {
        "clf_loaded": clf is not None,
        "reg_loaded": reg is not None,
        "meta_loaded": META != {},
    }
