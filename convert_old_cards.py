"""
将老版本色卡 JSON 转换为新版本格式。

老格式:
  { "色号": { "num": "色号", "type": "normal", "color": "rgb(...)", "color1": "rgb(...)" } }

新格式:
  { "name": "卡名", "author": "unknown", "version": 1, "colors": [{ "id": "色号", "type": "solid", "color1": "#rrggbb", "color2": null }] }

用法: python convert_old_cards.py
输出: src/assets/color_card/ 目录
"""

import json
import os
import re
from pathlib import Path

# 类型映射
TYPE_MAP = {
    "normal": "solid",
    "transparent": "transparent",
    "pearlescent": "pearl",
    "glow": "glow",
    "temperatrue": "thermo",  # 原数据拼写错误
    "light": "photo",
}

SRC_DIR = Path(__file__).parent / "src" / "assets" / "old_color_card"
OUT_DIR = Path(__file__).parent / "src" / "assets" / "color_card"


def rgb_to_hex(color_str: str) -> str:
    """将 rgb(r,g,b) 或 rgba(r,g,b,a) 转为 #rrggbb"""
    m = re.match(
        r"rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)",
        color_str,
    )
    if not m:
        # 如果已经是 hex 格式，直接返回
        if re.match(r"^#[0-9a-fA-F]{6}$", color_str):
            return color_str
        raise ValueError(f"无法解析颜色: {color_str}")

    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    a = float(m.group(4)) if m.group(4) is not None else 1.0

    if a < 1.0:
        # 与白色背景混合
        r = round(r * a + 255 * (1 - a))
        g = round(g * a + 255 * (1 - a))
        b = round(b * a + 255 * (1 - a))

    return f"#{r:02x}{g:02x}{b:02x}"


def convert_card(filepath: Path) -> dict | None:
    with open(filepath, encoding="utf-8") as f:
        old_data = json.load(f)

    if not isinstance(old_data, dict) or not old_data:
        return None

    card_name = filepath.stem
    colors = []

    for key, entry in old_data.items():
        if not isinstance(entry, dict):
            continue

        old_type = entry.get("type", "normal")
        new_type = TYPE_MAP.get(old_type)
        if new_type is None:
            print(f"  [警告] {card_name}: 未知类型 '{old_type}'，跳过 {key}")
            continue

        try:
            color1_hex = rgb_to_hex(entry.get("color1", entry.get("color", "#000000")))
        except ValueError as e:
            print(f"  [警告] {card_name}/{key}: {e}")
            continue

        color2 = entry.get("color2")
        color2_hex = None
        if color2 is not None and color2 != "":
            try:
                color2_hex = rgb_to_hex(color2)
            except ValueError:
                color2_hex = None

        colors.append({
            "id": key,
            "type": new_type,
            "color1": color1_hex,
            "color2": color2_hex,
        })

    if not colors:
        return None

    return {
        "name": card_name,
        "author": "unknown",
        "version": 1,
        "colors": colors,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filepath in sorted(SRC_DIR.glob("*.json")):
        if filepath.name == "manifest.json":
            continue

        print(f"转换 {filepath.name} ...")
        card = convert_card(filepath)
        if card is None:
            print(f"  跳过（无有效数据）")
            continue

        out_path = OUT_DIR / f"{card['name']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(card, f, ensure_ascii=False, indent=2)

        print(f"  → {out_path.name}  ({len(card['colors'])} 个颜色)")


if __name__ == "__main__":
    main()
