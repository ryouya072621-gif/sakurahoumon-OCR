"""
DentNet CSV 変換ロジック

相談シートの構造化データ → DentNet患者登録用CSV (22列, ヘッダーなし, CP932)

②かざぐるま名東整え後CSVフォーマット:
 1. 患者番号（空欄）
 2. 姓
 3. 名
 4. 姓(かな)
 5. 名(かな)
 6. 生年月日  「1952/09/21 (昭和27年)」形式
 7. 年齢
 8. 性別
 9. 施設名
10. 最終来院日（空欄）
11. 中断期間（空欄）
12. 数値1（0）
13. 数値2（0）
14-16. 空欄
17. 変更不可
18. ;（セミコロン区切り）
19. ─
20. ─
21. 空欄
22. 空欄
"""

import csv
import io

# 和暦→西暦変換テーブル
ERA_OFFSETS = {
    "明治": 1867,
    "大正": 1911,
    "昭和": 1925,
    "平成": 1988,
    "令和": 2018,
}


def era_to_western(era, year):
    """和暦を西暦に変換"""
    offset = ERA_OFFSETS.get(era, 0)
    if offset == 0:
        return None
    return offset + int(year)


def format_dob(data):
    """生年月日を「1952/09/21 (昭和27年)」形式に変換"""
    p = data.get("patient", {})

    # dob_western が既にある場合
    western = p.get("dob_western", "")
    era = p.get("dob_era", "")
    era_year = p.get("dob_year", "")

    if western and era and era_year:
        return f"{western} ({era}{era_year}年)"

    if western:
        return western

    # 西暦を計算
    if era and era_year:
        w_year = era_to_western(era, era_year)
        month = str(p.get("dob_month", 1)).zfill(2)
        day = str(p.get("dob_day", 1)).zfill(2)
        if w_year:
            return f"{w_year}/{month}/{day} ({era}{era_year}年)"

    return ""


def structured_to_dentnet_row(data):
    """構造化JSONデータを DentNet CSV の1行（22列リスト）に変換"""
    p = data.get("patient", {})

    row = [
        "",                                    # 1. 患者番号（空欄）
        p.get("sei", ""),                      # 2. 姓
        p.get("mei", ""),                      # 3. 名
        p.get("furigana_sei", ""),             # 4. 姓(かな)
        p.get("furigana_mei", ""),             # 5. 名(かな)
        format_dob(data),                      # 6. 生年月日
        str(p.get("age", "")),                 # 7. 年齢
        p.get("gender", ""),                   # 8. 性別
        p.get("facility", ""),                 # 9. 施設名
        "",                                    # 10. 最終来院日
        "",                                    # 11. 中断期間
        "0",                                   # 12. 数値1
        "0",                                   # 13. 数値2
        "",                                    # 14. 空欄
        "",                                    # 15. 空欄
        "",                                    # 16. 空欄
        "変更不可",                             # 17. 変更不可
        ";;;;;;;;;",                           # 18. セミコロン
        "\u2500",                              # 19. ─
        "\u2500",                              # 20. ─
        "",                                    # 21. 空欄
        "",                                    # 22. 空欄
    ]
    return row


def rows_to_csv_bytes(rows):
    """行リストをCP932エンコードのCSVバイト列に変換"""
    output = io.StringIO()
    writer = csv.writer(output)
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode("cp932", errors="replace")
