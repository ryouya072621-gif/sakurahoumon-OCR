import os
import json
import base64
import anthropic

MODEL_CORRECT = "claude-haiku-4-5-20251001"
MODEL_STRUCTURE = "claude-sonnet-4-5-20250929"


def get_client():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY が設定されていません。.env ファイルまたは環境変数に設定してください。")
    return anthropic.Anthropic(api_key=api_key)


SYSTEM_PROMPT_CORRECT = """\
あなたは医療文書のOCR校正の専門家です。
OCRで読み取った日本語の医療文書テキストを校正してください。

## ルール
1. 明らかなOCR誤読を修正する（例: 「版」→「歳」、「機」→「殿」、「党王」→「覚王」）
2. 医療用語・薬剤名は正確に（例: シルニジピン錠、マグミット錠、ベオーバ錠）
3. 人名・施設名は文脈から推測できる場合のみ修正
4. 原文にない情報を追加しない
5. 修正した箇所に注釈を付けない（自然に修正するだけ）
6. 読み取れない部分は「[?]」マーク

## 文書の種類
訪問歯科診療相談シート、居宅療養管理指導報告書、服薬指導報告書、介護関連文書
"""


SYSTEM_PROMPT_STRUCTURE = """\
あなたは日本語の医療・介護フォームを構造化するエキスパートです。

OCRで読み取ったテキストデータを分析し、フォームの構造を正確に抽出してください。

## 日本語フォーム特有のパターン

### パターン1: 丸囲み選択（circled selection）
フォーム上で並列の選択肢があり、選ばれた方に○（丸）が手書きで打たれるパターン。
OCRでは丸が「○」「◎」「0」（ゼロ）「@」「O」として読み取られる場合がある。

例:
- 「性別: 男 ・ 女」 → 「女」に○ → selected: "女"
- 「明 ・ 大 ・ 昭 ・ 平 ・ 令」 → 元号選択。「昭」に○なら昭和が選択
- 「1割 ・ 2割 ・ 3割」 → 負担割合の選択
- 「あり ・ 路駐 ・ なし」 → 駐車場の有無
- 「有 ・ 無」 → あり/なしの選択

**判定方法**: OCRテキスト中で、選択肢の文字に「○」「0」「@」「O」が隣接・重畳していれば、それが選択マーク。

### パターン2: ふりがな/名前の分離
フォームでは1つのセル内で、上段=ふりがな（ひらがな）、下段=漢字名が点線（…）で区切られている。
OCRは1つのテキストとして読み取るため「やまだたろう山田太郎」のようになる。

**判定方法**: テキストの前半がひらがな/カタカナ、後半が漢字なら分離する。
出力: {"label": "氏名", "furigana": "やまだ たろう", "value": "山田 太郎"}

### パターン3: 選択肢＋補足記入
選択肢を丸で選んだ後に、自由記述の補足欄があるパターン。

例:
- 「駐車場: あり・路駐・なし」＋「建物の横か裏」（補足記入）
- 「認定: 要支援1・2 / 要介護1・2・3・4・5 / 申請中」＋「申請日: R8.3.1」

出力: {"label": "駐車場", "type": "selection", "options": [...], "note": "建物の横か裏"}

### パターン4: 既往歴チェックリスト
印刷済みの病名一覧から○やチェックが打たれたものだけを抽出する。
○がない項目は **出力しない**（checked: false を含めない）。見やすさを優先する。
「その他」の手書き記入がある場合は "other" フィールドに入れる。

例: 認知症に○、骨粗鬆症に○、足腰が不自由に○ → checked: true のもののみ出力
「その他」に「MCIと言われている」と記入 → other フィールド

出力:
{"label": "既往歴", "type": "checklist",
 "items": [{"text": "認知症", "checked": true}, {"text": "骨粗鬆症", "checked": true}, {"text": "足腰が不自由", "checked": true}],
 "other": "MCIと言われている・物忘れ"}

### パターン5: スケジュール表
曜日×時間帯のマトリクスで○×△を正確にマッピング

### パターン6: チェックマーク（✓/レ点）
チェックボックスに✓が入っているパターン。OCRでは「V」「レ」「✓」として読み取られる場合がある。
○が打たれたものと同様に判定する。

## 選択項目の判定ルール（重要）
1. 「○」「◎」「@」「0」（ゼロ）「O」が丸印として使われている場合がある
2. 「×」「X」「x」「メ」がバツ印として使われている場合がある
3. 「△」が三角印として使われている場合がある
4. **選択されていない項目は極力省略する**（特にチェックリスト型）
5. 実際に選ばれたものだけを `selected: true` / `checked: true` にする

## 出力形式
JSON形式で以下の構造:
{
  "document_type": "文書の種類",
  "sections": [
    {
      "title": "セクション名",
      "type": "info|selection|schedule|text|checklist",
      "fields": [
        {"label": "ラベル", "value": "値"},
        ...
      ]
    }
  ]
}

### type別のfields形式:
- **info**: {"label": "氏名", "value": "山田太郎"} — ふりがながある場合: {"label": "氏名", "furigana": "やまだ たろう", "value": "山田 太郎"}
- **selection**: {"label": "質問文", "options": [{"text": "選択肢A", "selected": true}, {"text": "選択肢B", "selected": false}]} — 補足記入がある場合: "note" を追加
- **schedule**: {"label": "訪問可能曜日", "grid": {"header": ["日","月","火","水","木","金","土"], "rows": [{"label":"AM", "values":["○","×","×","△","×","×","○"]}, ...]}}
- **checklist**: {"label": "今回はどうされましたか？", "items": [{"text": "口腔ケアをして欲しい", "checked": true}], "other": "その他記入内容"} — ★checked: trueのもののみ出力。checked: falseは省略。
- **text**: {"label": "メモ欄", "value": "自由記述テキスト"}
"""


def _build_ocr_text(page_data):
    """ページデータからテキスト表現を構築"""
    text_parts = []
    elements = []
    for i, p in enumerate(page_data.get("paragraphs", [])):
        elements.append(("paragraph", p.get("order", i), p))
    for i, t in enumerate(page_data.get("tables", [])):
        elements.append(("table", t.get("order", 1000 + i), t))
    elements.sort(key=lambda x: x[1])

    for etype, _, edata in elements:
        if etype == "paragraph":
            role = edata.get("role", "")
            # 欄外テキスト（page_header/page_footer）を除外
            if role in ("page_header", "page_footer"):
                continue
            text = edata.get("contents", "")
            if role == "section_heading":
                text_parts.append(f"## {text}")
            else:
                text_parts.append(text)
        else:
            n_row = edata.get("n_row", 0)
            n_col = edata.get("n_col", 0)
            if n_row == 0 or n_col == 0:
                continue
            grid = [["" for _ in range(n_col)] for _ in range(n_row)]
            for cell in edata.get("cells", []):
                r = (cell.get("row", 1)) - 1
                c = (cell.get("col", 1)) - 1
                grid[r][c] = cell.get("contents", "").replace("\n", " ")
            for row in grid:
                text_parts.append("| " + " | ".join(row) + " |")
            text_parts.append("")
    return "\n".join(text_parts)


def correct_and_update(page_data):
    """OCRデータをHaiku 4.5で高速校正"""
    client = get_client()

    items = []
    for i, p in enumerate(page_data.get("paragraphs", [])):
        items.append({
            "type": "paragraph",
            "index": i,
            "role": p.get("role", ""),
            "text": p.get("contents", ""),
        })
    for ti, t in enumerate(page_data.get("tables", [])):
        for ci, cell in enumerate(t.get("cells", [])):
            items.append({
                "type": "table_cell",
                "table_index": ti,
                "cell_index": ci,
                "row": cell.get("row"),
                "col": cell.get("col"),
                "text": cell.get("contents", ""),
            })

    message = client.messages.create(
        model=MODEL_CORRECT,
        max_tokens=8192,
        system=SYSTEM_PROMPT_CORRECT,
        messages=[
            {
                "role": "user",
                "content": (
                    "以下はOCRで読み取った医療文書の各テキスト要素です。JSON配列で返してください。\n"
                    "各要素の `text` フィールドを校正し、他のフィールドはそのまま返してください。\n"
                    "レスポンスはJSON配列のみ（```なし）で返してください。\n\n"
                    + json.dumps(items, ensure_ascii=False, indent=2)
                ),
            }
        ],
    )

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        response_text = "\n".join(lines)

    corrected_items = json.loads(response_text)

    corrections = []
    for item in corrected_items:
        if item["type"] == "paragraph":
            idx = item["index"]
            if idx >= len(page_data.get("paragraphs", [])):
                continue
            old = page_data["paragraphs"][idx]["contents"]
            new = item["text"]
            if old != new:
                page_data["paragraphs"][idx]["contents"] = new
                corrections.append({"type": "paragraph", "index": idx, "old": old, "new": new})
        elif item["type"] == "table_cell":
            ti = item["table_index"]
            ci = item["cell_index"]
            tables = page_data.get("tables", [])
            if ti >= len(tables):
                continue
            cells = tables[ti].get("cells", [])
            if ci >= len(cells):
                continue
            old = cells[ci]["contents"]
            new = item["text"]
            if old != new:
                cells[ci]["contents"] = new
                corrections.append({"type": "table_cell", "table": ti, "cell": ci, "old": old, "new": new})

    return corrections


def extract_structured(page_data, page_image_base64=None):
    """フォーム構造を解析し、○/×/チェック項目を抽出。画像があればVision APIで丸囲みを目視判定。"""
    client = get_client()
    ocr_text = _build_ocr_text(page_data)

    user_text = (
        "以下はOCRで読み取った医療・介護のフォームです。\n"
        "フォームの構造を解析し、選択項目（○/×/チェック）、記入欄、スケジュール表などを正確に抽出してください。\n\n"
        "★重要: 画像も添付しています。OCRテキストだけでは丸囲み（○）の判定が難しいため、\n"
        "画像を見て実際にどの項目に○が打たれているか、チェックが入っているかを目視で判定してください。\n"
        "特に既往歴チェックリストや性別選択、元号選択などの丸囲みは画像から判断してください。\n\n"
        "JSONのみ返してください（```なし）。\n\n"
        f"--- OCRテキスト ---\n{ocr_text}\n---"
    )

    # Build content blocks (image + text)
    content = []
    if page_image_base64:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": page_image_base64,
            },
        })
    content.append({"type": "text", "text": user_text})

    message = client.messages.create(
        model=MODEL_STRUCTURE,
        max_tokens=8192,
        system=SYSTEM_PROMPT_STRUCTURE,
        messages=[{"role": "user", "content": content}],
    )

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        response_text = "\n".join(lines)

    return json.loads(response_text)


def analyze_page(page_data, page_image_base64=None):
    """AI校正→構造化抽出を順次実行する一体化関数"""
    # Step 1: AI校正 (Haiku - 高速)
    corrections = correct_and_update(page_data)

    # Step 2: 構造化抽出 (Sonnet + Vision)
    structured = extract_structured(page_data, page_image_base64)

    return corrections, structured
