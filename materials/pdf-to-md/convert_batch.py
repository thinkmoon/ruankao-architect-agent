#!/usr/bin/env python3
"""
PDF页面图片 → Markdown，通过 qwen3.6-27b Vision (OpenAI-compatible API)
每批10页，相邻批重叠1页作上下文
用法: python3 convert_batch.py <range_start> <range_end>
"""

import os
import json
import base64
import urllib.request
import urllib.error
import time
import sys

BASE_URL = "http://10.20.12.26:8317/v1"
API_KEY = "sk-liqinsi"
MODEL = "qwen3.6-27b"
IMG_DIR = "/tmp/baodian"
OUT_DIR = "/home/liqinsi/Documents/project/ruankao-architect-agent/materials/preprocessed/2026-baodian"
TOTAL_PAGES = 158
BATCH_SIZE = 10
OVERLAP = 1


def load_image_b64(page_num):
    path = f"{IMG_DIR}/pg-{page_num:03d}.jpg"
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def call_vision_api(images_with_labels, primary_start, primary_end):
    """
    images_with_labels: list of (page_num, b64_data)
    primary_start/end: 本批主要输出页范围（1-indexed）
    """
    content = []
    for page_num, b64 in images_with_labels:
        content.append({"type": "text", "text": f"--- 第 {page_num} 页 ---"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
        })

    content.append({
        "type": "text",
        "text": f"""请将上述页面（第 {primary_start} 至第 {primary_end} 页为主要内容，其余为上下文参考）的全部内容精确转写为 Markdown 格式。

**输出要求：**
1. 只输出第 {primary_start} 页到第 {primary_end} 页的内容，上下文页仅用于理解断句和连贯性
2. 严格保留原文所有文字，禁止省略、改写或总结
3. 每页开头标注 `<!-- p.NNN -->`（NNN 为三位页码）
4. 标题层级：用 # / ## / ### 对应原书层级
5. 表格用 Markdown 表格语法（|col|col|）
6. 有序/无序列表用 1. 或 -
7. 数学公式用 $...$ 或 $$...$$
8. 图表：若为纯图则用 `[图：XXX描述]` 占位；若含文字标注则用文字结构描述；流程图/架构图尝试用 mermaid 代码块复原
9. 水印、页眉页脚（如"希赛网"、"内部资料"、"客服热线"等）忽略不转写
10. 直接输出 Markdown 内容，不加任何前言、解释或结尾说明"""
    })

    payload = {
        "model": MODEL,
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": content}]
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read().decode())
        if "choices" not in result:
            raise ValueError(f"Unexpected response: {result}")
        return result["choices"][0]["message"]["content"]


def process_batch(batch_start, batch_end):
    out_file = f"{OUT_DIR}/part-{batch_start:03d}-{batch_end:03d}.md"
    if os.path.exists(out_file):
        print(f"[SKIP] part-{batch_start:03d}-{batch_end:03d}.md 已存在", flush=True)
        return True

    ctx_start = max(1, batch_start - OVERLAP)
    ctx_end = min(TOTAL_PAGES, batch_end + OVERLAP)

    print(f"[LOAD] 页 {ctx_start}-{ctx_end} (主体 {batch_start}-{batch_end})...", flush=True)
    images = []
    for p in range(ctx_start, ctx_end + 1):
        b64 = load_image_b64(p)
        images.append((p, b64))

    print(f"[API ] 调用中 ({len(images)}张图)...", flush=True)
    max_retry = 3
    for attempt in range(1, max_retry + 1):
        try:
            md = call_vision_api(images, batch_start, batch_end)
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(f"<!-- batch: pages {batch_start}-{batch_end} -->\n\n")
                f.write(md)
                f.write("\n")
            print(f"[OK  ] part-{batch_start:03d}-{batch_end:03d}.md ({len(md):,} chars)", flush=True)
            return True
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:400]
            print(f"[ERR ] 批次 {batch_start}-{batch_end} 尝试{attempt}/{max_retry} HTTP {e.code}: {body}", flush=True)
            if e.code in (429, 529) and attempt < max_retry:
                time.sleep(30 * attempt)
            elif attempt >= max_retry:
                return False
        except Exception as e:
            print(f"[ERR ] 批次 {batch_start}-{batch_end} 尝试{attempt}/{max_retry}: {e}", flush=True)
            if attempt < max_retry:
                time.sleep(10 * attempt)
            else:
                return False
    return False


def main():
    if len(sys.argv) < 3:
        print("用法: python3 convert_batch.py <range_start> <range_end>")
        sys.exit(1)

    range_start = int(sys.argv[1])
    range_end = int(sys.argv[2])

    page = range_start
    batch_num = 0
    errors = []

    while page <= range_end:
        batch_end = min(page + BATCH_SIZE - 1, range_end)
        batch_num += 1
        print(f"\n=== 批次 {batch_num}: 第 {page}-{batch_end} 页 ===", flush=True)
        ok = process_batch(page, batch_end)
        if not ok:
            errors.append((page, batch_end))
        page += BATCH_SIZE
        if page <= range_end:
            time.sleep(1)

    print(f"\n完成。共 {batch_num} 批。失败批次: {errors}", flush=True)
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
