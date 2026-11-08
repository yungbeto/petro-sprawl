# Manual import, step 1 of 2 (SPEC M13 phase 1): GEM's Global Oil and Gas Extraction Tracker ->
# data/derived/goget-rows.json, the sheets' rows as GEM gives them. Step 2 (jobs/import-fields.ts) turns them
# into fields and projects and publishes data/derived/gem-fields.json.
# Source: https://globalenergymonitor.org/projects/global-oil-and-gas-extraction-tracker/ (March 2026 release),
# CC BY 4.0, credit Global Energy Monitor. Put the spreadsheet in data/raw/gem/, then: npm run import:fields

import hashlib
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from xlsx import rows, shared_strings  # noqa: E402

SOURCE = 'data/raw/gem/Global-Oil-and-Gas-Extraction-Tracker-March-2026.xlsx'
OUT = 'data/derived/goget-rows.json'
# Sheet -> the column that identifies a row. Rows without one are the sheet's blank tail.
SHEETS = {
    'Field-level main data': ('fields', 'Unit ID'),
    'Field-level production data': ('fieldOutput', 'Unit ID'),
    'Project-level main data': ('projects', 'Project ID'),
    'Project-level production data': ('projectOutput', 'Project ID'),
}
# Columns phase 1 uses; the rest (reserves, outlines, blocks) wait for phase 2.
KEEP = {
    'fields': ['Unit ID', 'Unit Name', 'Name Other', 'Fuel type', 'Country/Area', 'Subnational unit', 'Production Type',
               'Status', 'Status year', 'Operator', 'Owner(s)', 'Discovery year', 'Production start year',
               'Wiki URL (field)', 'Latitude', 'Longitude', 'Location accuracy', 'Onshore/Offshore'],
    'fieldOutput': ['Unit ID', 'Fuel description', 'Quantity (converted)', 'Units (converted)', 'Data Year'],
    'projects': ['Project ID', 'Project Name', 'Name Other', 'Fuel type', 'Country/Area', 'Subnational unit',
                 'Production Type', 'Status', 'Status year', 'Operator', 'Owner(s)', 'Discovery year',
                 'Production start year', 'Units (list of IDs)', 'Wiki URL (project)', 'Latitude', 'Longitude',
                 'Location accuracy', 'Project location type', 'Onshore/Offshore'],
    'projectOutput': ['Project ID', 'Fuel description', 'Quantity (converted)', 'Units (converted)', 'Data source type'],
}


def main():
    with open(SOURCE, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    z = zipfile.ZipFile(SOURCE)
    strings = shared_strings(z)
    out = {'source': os.path.basename(SOURCE), 'sha256': sha}
    for sheet, (key, id_column) in SHEETS.items():
        out[key] = [
            {c: row[c] for c in KEEP[key] if row.get(c) not in (None, '')}
            for row in rows(z, sheet, strings)
            if row.get(id_column)
        ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f'{OUT}: ' + ', '.join(f'{len(out[k])} {k}' for k, _ in SHEETS.values()))


main()
