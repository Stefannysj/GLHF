#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re, sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

class Audit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]; self.hrefs=[]; self.srcs=[]; self.text=[]
        self.developer=False; self.dock=False; self.dock_orientation=False
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if d.get('id'): self.ids.append(d['id'])
        if tag != 'base' and d.get('href'): self.hrefs.append(d['href'])
        if d.get('src'): self.srcs.append(d['src'])
        if tag == 'header' and 'data-movable-dock' in d:
            self.dock=True
            self.dock_orientation=d.get('data-dock-orientation') == 'horizontal'
    def handle_data(self, data):
        t=' '.join(data.split())
        if t:
            self.text.append(t)
            if 'Desarrolladora: Stefanny' in t: self.developer=True

def local_path(base: Path, value: str):
    if not value or value.startswith(('#','data:','mailto:','tel:')): return None
    u=urlparse(value)
    if u.scheme or u.netloc: return None
    if not u.path: return None
    return (base / u.path).resolve()

def audit_html(path: Path, public_root: Path):
    parser=Audit(); raw=path.read_text(encoding='utf-8'); parser.feed(raw)
    dup=sorted({x for x in parser.ids if parser.ids.count(x)>1})
    targets=set(parser.ids)
    missing_frag=sorted({h[1:] for h in parser.hrefs if h.startswith('#') and h!='#' and h[1:] not in targets})
    missing=[]
    for value in parser.hrefs+parser.srcs:
        candidate=local_path(public_root,value)
        if candidate is not None and not candidate.exists(): missing.append(value)
    pwa_tokens=('manifest.webmanifest','sw.js','serviceWorker','beforeinstallprompt','data-pwa-install')
    return {
        'duplicate_ids': dup,
        'missing_fragment_targets': missing_frag,
        'missing_local_assets': sorted(set(missing)),
        'developer_footer': parser.developer,
        'movable_dock_present': parser.dock,
        'dock_default_orientation_horizontal': parser.dock_orientation,
        'loading_screen_text_present': any(t.lower() in {'cargando','loading','loading...','cargando...'} for t in parser.text),
        'pwa_references_present': any(token in raw for token in pwa_tokens),
    }

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--root',default='.'); ap.add_argument('--published')
    ns=ap.parse_args(); root=Path(ns.root).resolve(); pub=Path(ns.published).resolve() if ns.published else root/'wwwroot'
    index=pub/'index.html'
    checks=audit_html(index,pub)
    png=list(pub.rglob('*.png'))
    forbidden=[p for p in root.rglob('*') if p.is_file() and (p.name.lower()=='readme.md' or p.name=='.env' or p.name.startswith('.env.'))]
    logo=pub/'assets/Logo_GgWp.png'
    sha=hashlib.sha256(logo.read_bytes()).hexdigest() if logo.exists() else None
    pwa_files=[str(p.relative_to(root)) for p in [root/'wwwroot/manifest.webmanifest', root/'wwwroot/sw.js'] if p.exists()]
    result={
        'html':checks,
        'png_count':len(png),
        'png_names':[str(p.relative_to(pub)) for p in png],
        'forbidden_files':[str(p.relative_to(root)) for p in forbidden],
        'pwa_files_present':pwa_files,
        'logo_sha256':sha,
    }
    errors=[]
    if checks['duplicate_ids']: errors.append('duplicate ids')
    if checks['missing_fragment_targets']: errors.append('missing fragment targets')
    if checks['missing_local_assets']: errors.append('missing local assets')
    if not checks['developer_footer']: errors.append('developer footer missing')
    if not checks['movable_dock_present'] or not checks['dock_default_orientation_horizontal']: errors.append('dock markup invalid')
    if checks['loading_screen_text_present']: errors.append('loading screen detected')
    if checks['pwa_references_present'] or pwa_files: errors.append('PWA was not fully removed')
    if len(png)!=1 or png[0].name!='Logo_GgWp.png': errors.append('PNG policy failed')
    if forbidden: errors.append('forbidden README/.env files')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors:
        print('QA FAILED: '+', '.join(errors),file=sys.stderr); return 1
    print('QA PASS')
    return 0
if __name__=='__main__': raise SystemExit(main())
