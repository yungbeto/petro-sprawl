# Manual import, step 1 of 2: EIA Refinery Capacity Report, individual refinery capacities ->
# data/derived/eia-refineries.json. Step 2 (jobs/import-refineries-us.ts) places them and publishes.
# Source: https://www.eia.gov/petroleum/refinerycapacity/ (refcap26.xlsx, released June 2026, capacity as of
# 1 January 2026). Put the spreadsheet in data/raw/eia/, then: npm run import:refineries-us
#
# One record per site with atmospheric crude distillation capacity, in barrels per calendar day: operable,
# operating and idle, as EIA splits it. Sites EIA lists without crude distillation (process units only, such
# as alkylation or lubricants plants) run no crude, so they're left out and named in the report.

import hashlib
import json
import os
import sys
import zipfile
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from xlsx import rows, shared_strings  # noqa: E402

SOURCE = 'data/raw/eia/refcap26.xlsx'
SHEET = 'refcap26'
AS_OF = '2026-01-01'
OUT = 'data/derived/eia-refineries.json'
REPORT = 'data/reports/import-refineries-us-eia.json'
CRUDE = 'Atmospheric Crude Distillation Capacity (barrels per calendar day)'
FIELDS = {'TOTAL OPERABLE CAPACITY': 'operable', 'OPERATING CAPACITY': 'operating', 'IDLE CAPACITY': 'idle'}


def main():
    with open(SOURCE, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    z = zipfile.ZipFile(SOURCE)
    sites = {}
    every = set()
    for row in rows(z, SHEET, shared_strings(z)):
        key = (row['COMPANY_NAME'], row['SITE'], row['STATE_NAME'])
        every.add(key)
        if row.get('SUPPLY') != CRUDE or row.get('PRODUCT') not in FIELDS:
            continue
        site = sites.setdefault(
            key,
            {
                'corporation': row['CORPORATION'],
                'company': row['COMPANY_NAME'],
                'site': row['SITE'],
                'state': row['STATE_NAME'],
                'padd': int(row['PADD']),
                'operable': 0,
                'operating': 0,
                'idle': 0,
            },
        )
        site[FIELDS[row['PRODUCT']]] = int(float(row['QUANTITY']))
    records = sorted(sites.values(), key=lambda s: (s['state'], s['site'], s['company']))
    mismatched = [s for s in records if s['operating'] + s['idle'] != s['operable']]
    if mismatched:
        raise SystemExit(f'operating and idle do not add up to operable at {len(mismatched)} sites, first {mismatched[0]}')
    with open(OUT, 'w') as f:
        json.dump(
            {
                'source': f'EIA Refinery Capacity Report, individual refinery capacities, as of {AS_OF}; refcap26.xlsx sha256:{sha}',
                'asOf': AS_OF,
                'refineries': records,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )
        f.write('\n')
    without = sorted(' / '.join(k) for k in every - set(sites))
    with open(REPORT, 'w') as f:
        json.dump(
            {
                'recordedAt': date.today().isoformat(),
                'sitesInSpreadsheet': len(every),
                'withCrudeDistillation': len(records),
                'withoutCrudeDistillation': without,
                'operableBarrelsPerCalendarDay': sum(s['operable'] for s in records),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
        f.write('\n')
    print(f'eia-refineries: {len(records)} sites with crude distillation of {len(every)}; report in {REPORT}')


if __name__ == '__main__':
    main()
