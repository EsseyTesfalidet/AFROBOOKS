"""Regenerate full-coverage WOFF2 fonts: pip install fonttools brotli, then run."""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1] / "public" / "fonts"
for name in ("DMSans", "Manrope", "NotoSansEthiopic"):
    source = root / f"{name}.ttf"
    target = root / f"{name}.woff2"
    with TTFont(source, recalcTimestamp=False) as font:
        coverage = font.getBestCmap()
        metrics = dict(font["hmtx"].metrics)
        font.flavor = "woff2"
        font.save(target)
    with TTFont(target) as compressed:
        assert compressed.getBestCmap() == coverage, f"Glyph coverage changed: {name}"
        assert dict(compressed["hmtx"].metrics) == metrics, f"Glyph widths changed: {name}"
    print(f"{name}: {source.stat().st_size} -> {target.stat().st_size} bytes; coverage and widths preserved")
