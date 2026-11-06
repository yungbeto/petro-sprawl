# Manual import, step 1 of 2 (SPEC M11 phase 2): the EEA's Industrial Reporting database -> data/derived/eea-refineries.json.
# Step 2 (jobs/import-refineries-eu.ts) turns the rows into refineries and publishes them to data/derived/.
# Source: https://sdi.eea.europa.eu/datastore/public/eea_t_ied-eprtr_p_2007-2024_v16_r00/ (the .accdb, version 16,
# February 2026, reporting years 2007 to 2024), CC BY 4.0, European Environment Agency. Put it in data/raw/eea/,
# then: npm run import:refineries-eu. Reading Access needs mdbtools (brew install mdbtools); this script only
# calls its mdb-export.
#
# A refinery is a facility whose E-PRTR main activity is 1(a), "mineral oil and gas refineries", and whose NACE
# code is 19.20, manufacture of refined petroleum products: 1(a) also covers gas processing (Concawe's note on
# E-PRTR). A facility that reports no NACE code at all is kept when its name says refinery in one of the
# register's languages. Each facility keeps its latest year's status. Two kept facilities within SAME_SITE_KM are
# one site registered twice; the one that reported last stays. The report names what was dropped and why.

import csv
import glob
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from datetime import date

SOURCE_GLOB = 'data/raw/eea/Industrial_dataset_v_*.accdb'
OUT = 'data/derived/eea-refineries.json'
REPORT = 'data/reports/import-refineries-eu-eea.json'
ACTIVITY = '1(a)'
NACE = '19.20'
# Within a country, a facility that last reported more than RECENT_YEARS before that country's newest report has
# most likely closed or left the register. Countries report at their own pace (Slovakia runs a year or two
# behind). A country whose newest report is more than STOPPED_YEARS older than the register's newest has
# stopped reporting (the UK after 2019): its old rows would show closed refineries as permitted, so it's left out.
RECENT_YEARS = 2
STOPPED_YEARS = 3
REFINERY_WORD = re.compile(r'raffin|refin|rafin|jalostamo', re.I)
SAME_SITE_KM = 1.0
# Facilities the register files under 1(a) with NACE 19.20 that its own names say aren't refineries.
NOT_REFINERIES = {
    'HES Wilhelmshaven Tank Terminal GmbH': 'a tank terminal',
    'Vermilion Exploration and Production Ireland Limited': 'a gas producer',
    'O&GD Central Kft.': 'a gas producer',
}


def nace_code(raw):
    # Some countries prefix the section letter: "C.19.20".
    return re.sub(r'^[A-Z]\.?', '', (raw or '').strip())


def km(a, b):
    rad = math.pi / 180
    h = math.sin((b['lat'] - a['lat']) * rad / 2) ** 2 + math.cos(a['lat'] * rad) * math.cos(b['lat'] * rad) * math.sin((b['lon'] - a['lon']) * rad / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))


def table(db, name):
    out = subprocess.run([shutil.which('mdb-export'), db, name], check=True, capture_output=True).stdout
    return list(csv.DictReader(io.StringIO(out.decode('utf-8'))))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    if not shutil.which('mdb-export'):
        sys.exit('mdb-export not found: brew install mdbtools')
    found = sorted(glob.glob(SOURCE_GLOB))
    if not found:
        sys.exit(f'no database at {SOURCE_GLOB}')
    db = found[-1]
    facilities = {f['Facility_INSPIRE_ID']: f for f in table(db, '2_ProductionFacility')}
    nace = {}
    for row in table(db, '2c_Function'):
        code = nace_code(row['NACEMainEconomicActivityCode'])
        if code:
            nace.setdefault(row['Facility_INSPIRE_ID'], set()).add(code)
    details = {}
    for row in table(db, '2a_ProductionFacilityDetails'):
        fid, year = row['Facility_INSPIRE_ID'], int(row['reportingYear'])
        if fid not in details or year > details[fid]['year']:
            details[fid] = {'year': year, 'status': row['status']}
    newest = max(d['year'] for d in details.values())
    country_newest = {}
    for fid, d in details.items():
        c = facilities.get(fid, {}).get('countryCode')
        if c:
            country_newest[c] = max(country_newest.get(c, 0), d['year'])
    stopped = sorted(c for c, y in country_newest.items() if y < newest - STOPPED_YEARS)

    kept, dropped = [], Counter()
    dropped_names = {'nace': [], 'old': [], 'status': [], 'named': []}
    by_name = []
    for fid, f in facilities.items():
        if f['mainActivityCode'] != ACTIVITY:
            continue
        name = f['nameOfFeature'].strip()
        codes = nace.get(fid, set())
        detail = details.get(fid)
        where = f"{name} ({f['countryCode']})"
        if name in NOT_REFINERIES:
            dropped['named'] += 1
            dropped_names['named'].append(f'{where}: {NOT_REFINERIES[name]}')
            continue
        if not codes and REFINERY_WORD.search(name):
            pass
        elif NACE not in codes:
            dropped['nace'] += 1
            dropped_names['nace'].append(f"{where}: NACE {', '.join(sorted(codes)) or 'none'}")
            continue
        if f['countryCode'] in stopped:
            dropped['countryStopped'] += 1
            continue
        if not detail or detail['year'] <= country_newest[f['countryCode']] - RECENT_YEARS:
            dropped['old'] += 1
            dropped_names['old'].append(f"{where}: last reported {detail['year'] if detail else 'never'}")
            continue
        if detail['status'] != 'functional':
            dropped['status'] += 1
            dropped_names['status'].append(f"{where}: {detail['status']}")
            continue
        if not codes:
            by_name.append(where)
        kept.append({
            'inspireId': fid,
            'name': name,
            'parentCompany': (f.get('parentCompanyName') or '').strip() or None,
            'country': f['countryCode'],
            'city': (f.get('city') or '').strip() or None,
            'lat': float(f['pointGeometryLat']),
            'lon': float(f['pointGeometryLon']),
            'reportingYear': detail['year'],
        })
    # One site registered twice: keep the one that reported last.
    kept.sort(key=lambda r: (-r['reportingYear'], r['country'], r['name']))
    sites, same_site = [], []
    for r in kept:
        twin = next((k for k in sites if k['country'] == r['country'] and km(k, r) <= SAME_SITE_KM), None)
        if twin:
            same_site.append(f"{r['name']} ({r['country']}, {r['inspireId']}): same site as {twin['name']} ({twin['inspireId']})")
            dropped['sameSite'] += 1
        else:
            sites.append(r)
    kept = sorted(sites, key=lambda r: (r['country'], r['name']))
    version = os.path.basename(db)
    with open(OUT, 'w') as fh:
        json.dump({'source': f'EEA Industrial Reporting database, {version}, sha256:{sha256(db)}', 'newestYear': newest, 'refineries': kept}, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    os.makedirs('data/reports', exist_ok=True)
    with open(REPORT, 'w') as fh:
        json.dump({
            'recordedAt': date.today().isoformat(),
            'database': version,
            'newestYear': newest,
            'countryNewestYear': dict(sorted(country_newest.items())),
            'countriesStoppedReporting': stopped,
            'kept': len(kept),
            'dropped': dict(dropped),
            # 1(a) also covers gas processing; only NACE 19.20 is kept.
            'notRefinedProducts': sorted(dropped_names['nace']),
            'notReportingRecently': sorted(dropped_names['old']),
            'notFunctional': sorted(dropped_names['status']),
            'notRefineriesByName': sorted(dropped_names['named']),
            'sameSite': sorted(same_site),
            # No NACE code reported; kept because the name says refinery.
            'keptByName': sorted(by_name),
        }, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print(f"eea-refineries: {len(kept)} of {len(kept) + sum(dropped.values())} 1(a) facilities kept; dropped {dict(dropped)}; report in {REPORT}")


if __name__ == '__main__':
    main()
