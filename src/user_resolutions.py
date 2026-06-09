"""User-editable resolution presets for IllustriousEmptyLatentImage.

Custom presets and hidden built-ins are persisted to a JSON file in the
ComfyUI user directory so they survive pack updates:

    <user_dir>/easy_illustrious/custom_resolutions.json
    {"custom": {"<label>": "WxH", ...}, "hidden": ["<built-in label>", ...]}
"""

import json
import math
import os

import folder_paths

from . import RESOLUTIONS


def _store_path():
    return os.path.join(
        folder_paths.get_user_directory(),
        "easy_illustrious",
        "custom_resolutions.json",
    )


def load_store():
    store = {"custom": {}, "hidden": []}
    try:
        with open(_store_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data.get("custom"), dict):
            store["custom"] = {str(k): str(v) for k, v in data["custom"].items()}
        if isinstance(data.get("hidden"), list):
            store["hidden"] = [str(x) for x in data["hidden"] if str(x) in RESOLUTIONS]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return store


def save_store(store):
    path = _store_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)


def get_resolution_options():
    """Visible dropdown options: built-ins minus hidden, then custom presets."""
    store = load_store()
    options = {
        label: dims
        for label, dims in RESOLUTIONS.items()
        if label not in store["hidden"]
    }
    options.update(store["custom"])
    return options


def resolve_resolution(label):
    """Resolve any known label to 'WxH' — including hidden built-ins, so old
    workflows keep working after a built-in is removed from the dropdown."""
    store = load_store()
    return store["custom"].get(label) or RESOLUTIONS.get(label)


def _validate_dimension(value, name):
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer")
    if not 64 <= value <= 8192:
        raise ValueError(f"{name} must be between 64 and 8192")
    # Latent grid requires multiples of 8
    return max(64, round(value / 8) * 8)


def make_label(width, height, name=None):
    g = math.gcd(width, height)
    ratio = f"{width // g}:{height // g}"
    if width == height:
        orientation = "Square"
    elif width > height:
        orientation = "Landscape"
    else:
        orientation = "Portrait"
    title = (name or "").strip() or orientation
    return f"Custom | {title} ({ratio}) - {width}x{height}"


def add_custom_resolution(width, height, name=None):
    width = _validate_dimension(width, "width")
    height = _validate_dimension(height, "height")
    dims = f"{width}x{height}"

    store = load_store()
    # Reuse an existing preset with identical dimensions instead of duplicating
    for label, existing in store["custom"].items():
        if existing == dims:
            return label

    label = make_label(width, height, name)
    store["custom"][label] = dims
    save_store(store)
    return label


def delete_resolution(label):
    store = load_store()
    if label in store["custom"]:
        del store["custom"][label]
    elif label in RESOLUTIONS:
        if label not in store["hidden"]:
            store["hidden"].append(label)
    else:
        raise ValueError(f"Unknown resolution preset: {label}")

    remaining = len(RESOLUTIONS) - len(store["hidden"]) + len(store["custom"])
    if remaining < 1:
        raise ValueError("Cannot delete the last remaining preset")
    save_store(store)


def reset_hidden():
    """Restore all hidden built-in presets (custom presets are untouched)."""
    store = load_store()
    store["hidden"] = []
    save_store(store)
