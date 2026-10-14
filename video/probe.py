"""打开整片页面，执行一段 JS 表达式（可 await），把结果以 JSON 打印出来——用来做质检：
    python probe.py "await window.qaText(0, 389, 0.2)"     文字重叠 / 出画 / 一闪而过（qa_text.js）
    python probe.py "await window.qaSync()"                画面重击与音效提示点（qa_sync.js）
    python probe.py "await window.titleReport()"           字幕可读时长
"""
import argparse
import asyncio
import json
import sys

from playwright.async_api import async_playwright

import render


async def main(expr: str, out: str | None):
    async with async_playwright() as p:
        b, page, _ = await render.open_page(p)
        res = await page.evaluate(f"async () => {{ return {expr}; }}")
        await b.close()
    txt = json.dumps(res, ensure_ascii=False, indent=1)
    if out:
        open(out, "w", encoding="utf-8").write(txt)
        print(f"-> {out}")
    else:
        sys.stdout.write(txt + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("expr")
    ap.add_argument("--out")
    a = ap.parse_args()
    asyncio.run(main(a.expr, a.out))
