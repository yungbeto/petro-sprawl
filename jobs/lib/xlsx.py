# Reads an .xlsx with the Python standard library: the Node stack has nothing that reads one. Shared by
# import-gem-companies.py and import-refineries-us.py.

import re
import xml.etree.ElementTree as ET

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
