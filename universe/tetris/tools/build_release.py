#!/usr/bin/env python3
"""Promote the accepted UI to the existing universe entry; preserve its real session.
Run after build_prototype.py if regenerating the underlying game; --check never writes.
The sandbox builder strips the two marked presentation-only blocks before rebuilding.
"""
from pathlib import Path
import re,sys

ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'universe/tetris'
SOURCE=ROOT/'universe/tetris-ui-test'
VERSION='0.3.4'
JS=['ui-test.js','desktop-ui.js','ui-brand.js','balloon-assets.js','creation-story.js','guided-practice.js','tutorial.js','menu-audio.js']
CSS=['ui-test.css','ui-brand.css','desktop-ui.css','creation-story.css','tutorial.css']

def strip_release(s):
    return re.sub(r'<!-- BV-TETRIS-UI:(HEAD|BODY) -->\n[\s\S]*?<!-- /BV-TETRIS-UI:\1 -->\n','',s)

def once(s,old,new):
    if s.count(old)!=1: raise ValueError('Expected one occurrence: '+old[:80])
    return s.replace(old,new)

def outputs():
    base=strip_release((DEST/'index.html').read_text())
    head='<!-- BV-TETRIS-UI:HEAD -->\n'+''.join(f'<link rel="stylesheet" href="{f}?v={VERSION}">\n' for f in CSS)+'<!-- /BV-TETRIS-UI:HEAD -->\n'
    body='<!-- BV-TETRIS-UI:BODY -->\n'+''.join(f'<script src="{f}?v={VERSION}"></script>\n' for f in JS)+'<!-- /BV-TETRIS-UI:BODY -->\n'
    out={'index.html':once(once(base,'</head>',head+'</head>'),'</body>',body+'</body>').encode()}
    for f in JS+CSS:out[f]=(SOURCE/f).read_bytes()
    # Only sandbox sessions show sandbox badges. No test guard or demo identity enters this build.
    s=out['ui-test.js'].decode(); start=s.index('  var badgeBoard =');end=s.index('\n\n',start)
    s=s[:start]+"  if (window.UniverseTetris && UniverseTetris.session.isSandbox) {\n"+s[start:end]+"\n  }"+s[end:]
    out['ui-test.js']=s.encode()
    s=out['ui-brand.js'].decode().replace('tetris-universe-ui-v0.3.4-test-1','tetris-universe-ui-v'+VERSION).replace('UI v0.3.4-test-1','UI v'+VERSION)
    s=once(s,'  "use strict";', '  "use strict";\n  document.title = "氣球小V方塊派對 🎈｜遊戲宇宙";')
    out['ui-brand.js']=s.encode()
    # Copy exact approved assets, keeping release independent of future test-only edits.
    for f in (SOURCE/'assets').rglob('*'):
        if f.is_file() and f.name!='privacy-head.png':out[f.relative_to(SOURCE).as_posix()]=f.read_bytes()
    return out

def main():
    check='--check' in sys.argv;bad=[]
    for name,data in outputs().items():
        f=DEST/name
        if check:
            if not f.exists() or f.read_bytes()!=data:bad.append(name)
        else:
            f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
    if bad:sys.exit('Release differs: '+', '.join(bad))
    print('Tetris UI v'+VERSION+': '+('reproducible OK' if check else 'promoted to universe/tetris'))
if __name__=='__main__':main()
