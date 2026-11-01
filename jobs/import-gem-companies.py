# Manual import: GEM Global Energy Ownership Tracker -> data/derived/gem-companies.json
# Source: https://globalenergymonitor.org/projects/global-energy-ownership-tracker/
# Put the tracker's .xlsx in data/raw/gem/ (path below), then: npm run import:gem-companies, then npm run import:gem
#
# Python with the standard library only: the tracker is a spreadsheet and nothing in the Node stack reads
# one. It keeps each company's home page, as GEM gives it, by GEM entity ID and by name, so import:gem can
# link a pipeline's owners and parents. A name two companies share is left out of the names, so a link never
# goes to the wrong one. Home pages without a scheme get https://; anything else that isn't a web address
# is dropped and counted in the report.

import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date
from urllib.parse import urlparse

SOURCE = 'data/raw/gem/Global-Energy-Ownership-Tracker-September-2026-V2.xlsx'
RELEASE = '2026-09'
OUT = 'data/derived/gem-companies.json'
REPORT = 'data/reports/import-gem-companies.json'
SHEET = 'All Entities'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def shared_strings(z):
    strings = []
    for _, el in ET.iterparse(z.open('xl/sharedStrings.xml')):
        if el.tag == NS + 'si':
            strings.append(''.join(t.text or '' for t in el.iter(NS + 't')))
            el.clear()
    return strings


def sheet_path(z, name):
    workbook = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    rid = dict(re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', workbook))[name]
    for m in re.finditer(r'<Relationship [^>]*>', rels):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
        if attrs['Id'] == rid:
            target = attrs['Target'].lstrip('/')
            return target if target.startswith('xl/') else 'xl/' + target
    raise KeyError(name)


def rows(z, name, strings):
    """Each row as {header: value}, from the first row with more than three cells."""
    header = None
    for _, el in ET.iterparse(z.open(sheet_path(z, name))):
        if el.tag != NS + 'row':
            continue
        row = {}
        for c in el.iter(NS + 'c'):
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            v = c.find(NS + 'v')
            if v is not None:
                value = strings[int(v.text)] if c.get('t') == 's' else v.text
            else:
                inline = c.find(NS + 'is')
                value = ''.join(t.text or '' for t in inline.iter(NS + 't')) if inline is not None else None
            if value not in (None, ''):
                row[col] = value.strip()
        el.clear()
        if header is None:
            if len(row) > 3:
                header = row
            continue
        yield {header.get(k, k): v for k, v in row.items()}


def home_page(raw):
    """GEM's home page as a web address, or None. Bare domains get https://."""
    if not raw:
        return None
    url = raw.strip()
    if not re.match(r'^https?://', url, re.I):
        if not re.match(r'^[\w-]+(\.[\w-]+)+(/\S*)?$', url):
            return None
        url = 'https://' + url
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or '.' not in parsed.netloc or ' ' in url:
        return None
    return url


def name_key(name):
    return re.sub(r'\s+', ' ', name).strip().lower()


def main():
    with open(SOURCE, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    z = zipfile.ZipFile(SOURCE)
    strings = shared_strings(z)
    by_id = {}
    owners_of_name = {}
    total = 0
    with_home_page = 0
    invalid = []
    for row in rows(z, SHEET, strings):
        entity = row.get('Entity ID')
        if not entity or not entity.startswith('E'):
            continue
        total += 1
        names = sorted({n for n in (row.get('Full Name'), row.get('Name')) if n})
        for n in names:
            owners_of_name.setdefault(name_key(n), set()).add(entity)
        raw = row.get('Home Page')
        url = home_page(raw)
        if raw and not url:
            invalid.append(raw)
        if url:
            with_home_page += 1
            by_id[entity] = {'names': names, 'homePage': url}
    by_name = {}
    shared = 0
    for key, ids in owners_of_name.items():
        if len(ids) > 1:
            shared += 1
            continue
        (entity,) = ids
        if entity in by_id:
            by_name[key] = entity
    with open(OUT, 'w') as f:
        json.dump(
            {
                'source': f'GEM Global Energy Ownership Tracker {RELEASE}; {SOURCE.rsplit("/", 1)[-1]} sha256:{sha}',
                'license': 'CC BY 4.0, Global Energy Monitor',
                'byId': dict(sorted(by_id.items())),
                'byName': dict(sorted(by_name.items())),
            },
            f,
            ensure_ascii=False,
            separators=(',', ':'),
        )
        f.write('\n')
    with open(REPORT, 'w') as f:
        json.dump(
            {
                'recordedAt': date.today().isoformat(),
                'companies': total,
                'withHomePage': with_home_page,
                'homePagesNotWebAddresses': sorted(invalid),
                'namesSharedByCompanies': shared,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
        f.write('\n')
    print(f'gem-companies: {with_home_page} of {total} with a home page; {len(invalid)} not web addresses; report in {REPORT}')


if __name__ == '__main__':
    sys.exit(main())
