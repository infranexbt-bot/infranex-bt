"""Check SN105 rows in the app DB — override + live snapshot cache."""
import sqlite3, json, glob

for path in ["/home/z/my-project/db/custom.db", "/home/z/my-project/prisma/custom.db"]:
    print(f"\n=== {path} ===")
    try:
        con = sqlite3.connect(path)
        cur = con.cursor()
        tables = [r[0] for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print("tables:", tables)
        for t in tables:
            if "override" in t.lower() or "subnet" in t.lower():
                cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})").fetchall()]
                print(f"\n-- {t}: {cols}")
                rows = cur.execute(f"SELECT * FROM {t} WHERE netuid=105").fetchall()
                for r in rows:
                    d = dict(zip(cols, r))
                    for k, v in d.items():
                        if isinstance(v, str) and len(v) > 400:
                            v = v[:400] + "…"
                        print(f"   {k}: {v}")
        con.close()
    except Exception as e:
        print("ERR", e)
