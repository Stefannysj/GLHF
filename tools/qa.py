#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, re, sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

class Audit(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.hrefs=[]; self.srcs=[]; self.stage6=False; self.loading_text=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if d.get('id'): self.ids.append(d['id'])
        if tag != 'base' and d.get('href'): self.hrefs.append(d['href'])
        if d.get('src'): self.srcs.append(d['src'])
    def handle_data(self, data):
        t=' '.join(data.split())
        if t:
            self.loading_text.append(t)
            if 'ETAPA 06 / PULIDO FINAL Y QA' in t: self.stage6=True

def local_path(base: Path, value: str):
    if not value or value.startswith(('#','data:','mailto:','tel:')): return None
    u=urlparse(value)
    if u.scheme or u.netloc: return None
    clean=u.path
    if not clean: return None
    return (base / clean).resolve()

def audit_html(path: Path, public_root: Path):
    parser=Audit(); parser.feed(path.read_text(encoding='utf-8'))
    dup=sorted({x for x in parser.ids if parser.ids.count(x)>1})
    targets=set(parser.ids)
    missing_frag=sorted({h[1:] for h in parser.hrefs if h.startswith('#') and h!='#' and h[1:] not in targets})
    missing=[]
    for value in parser.hrefs+parser.srcs:
        candidate=local_path(public_root,value)
        if candidate is not None and not candidate.exists(): missing.append(value)
    return {
        'duplicate_ids': dup,
        'missing_fragment_targets': missing_frag,
        'missing_local_assets': sorted(set(missing)),
        'stage6_footer': parser.stage6,
        'loading_screen_text_present': any(t.lower() in {'cargando','loading','loading...','cargando...'} for t in parser.loading_text)
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
    result={
        'html':checks,
        'png_count':len(png),
        'png_names':[str(p.relative_to(pub)) for p in png],
        'forbidden_files':[str(p.relative_to(root)) for p in forbidden],
        'manifest':(pub/'manifest.webmanifest').is_file(),
        'service_worker':(pub/'sw.js').is_file(),
        'logo_sha256':sha,
    }
    errors=[]
    if checks['duplicate_ids']: errors.append('duplicate ids')
    if checks['missing_fragment_targets']: errors.append('missing fragment targets')
    if checks['missing_local_assets']: errors.append('missing local assets')
    if not checks['stage6_footer']: errors.append('stage 6 footer missing')
    if checks['loading_screen_text_present']: errors.append('loading screen detected')
    if len(png)!=1 or png[0].name!='Logo_GgWp.png': errors.append('PNG policy failed')
    if forbidden: errors.append('forbidden README/.env files')
    if not result['manifest'] or not result['service_worker']: errors.append('PWA files missing')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors:
        print('QA FAILED: '+', '.join(errors),file=sys.stderr); return 1
    print('QA PASS')
    return 0
if __name__=='__main__': raise SystemExit(main())
