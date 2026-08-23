# -*- coding: utf-8 -*-
"""
务思语 发布前自动检查（pre-release check）
用法: python pre-release-check.py
退出码: 0=全部通过, 1=有问题（禁止发布）

检查项:
  1. 版本号一致性: main.js / package.json / install_electron.py / app.py
  2. dist 隐私扫描: 禁止 config.json / 用户书籍 / 阅读历史 / 单词本 / 密钥文件
  3. 前端语法: 提取 <script> 用 node --check
  4. 后端语法: py_compile app.py
  5. API Key 泄漏扫描: 全仓库源码 grep sk- 模式
"""
import os, re, sys, json, subprocess, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
WIN = os.path.join(ROOT, '01-Windows版')
DIST = os.path.join(WIN, 'dist', '务思语-win32-x64')

errors = []
warnings = []

def err(msg): errors.append(msg); print(f'  ❌ {msg}')
def warn(msg): warnings.append(msg); print(f'  ⚠️  {msg}')
def ok(msg): print(f'  ✅ {msg}')

def section(title):
    print(f'\n━━━ {title} ━━━')

# ─── 1. 版本号一致性 ─────────────────────────────
section('1. 版本号一致性')
versions = {}

mj = open(os.path.join(WIN, 'main.js'), encoding='utf-8').read()
m = re.search(r"const APP_VERSION = '([\d.]+)'", mj)
versions['main.js'] = m.group(1) if m else None

pj = json.load(open(os.path.join(WIN, 'package.json'), encoding='utf-8'))
versions['package.json'] = pj.get('version')

ie = open(os.path.join(WIN, 'install_electron.py'), encoding='utf-8').read()
m = re.search(r'VERSION = "([\d.]+)"', ie)
versions['install_electron.py'] = m.group(1) if m else None

ap = open(os.path.join(ROOT, '02-Mac版', 'flask-app', 'app.py'), encoding='utf-8').read()
m = re.search(r'APP_VERSION = "([\d.]+)"', ap)
versions['app.py'] = m.group(1) if m else None

vals = set(versions.values())
for k, v in versions.items():
    print(f'  {k}: {v}')
if len(vals) == 1 and None not in vals:
    ok(f'全部一致: v{list(vals)[0]}')
else:
    for k, v in versions.items():
        if v is None:
            err(f'{k} 未找到版本号')
    if len(vals - {None}) > 1:
        err(f'版本号不一致: {versions}')

# ─── 2. dist 隐私扫描 ─────────────────────────────
section('2. dist 隐私扫描')
if not os.path.isdir(DIST):
    warn(f'dist 不存在（跳过）: {DIST}')
else:
    FORBIDDEN_FILES = {'config.json', 'reading_history.json', 'wordbook.json'}
    FORBIDDEN_EXT = {'.epub', '.pdf', '.docx', '.mobi', '.azw3', '.db', '.sqlite'}
    bad = []
    total = 0
    for root, dirs, files in os.walk(DIST):
        # 只查 flask-app 数据区 + 根目录，跳过纯运行时目录提速
        for f in files:
            total += 1
            fl = f.lower()
            p = os.path.join(root, f)
            rel = os.path.relpath(p, DIST).replace('\\', '/')
            if fl in FORBIDDEN_FILES:
                bad.append(rel)
            elif os.path.splitext(fl)[1] in FORBIDDEN_EXT:
                # 允许示例书 The Wonderful World of Words.txt 以外的一切书类
                bad.append(rel)
    if bad:
        for b in bad:
            err(f'dist 含用户数据/禁传文件: {b}')
    else:
        ok(f'扫描 {total} 个文件，无用户数据')

    # API key 内容扫描（flask-app 目录下所有小文本）
    leak = []
    flask_dir = os.path.join(DIST, 'resources', 'flask-app')
    for root, dirs, files in os.walk(flask_dir):
        for f in files:
            if f.endswith(('.json', '.txt', '.py', '.js', '.html')):
                p = os.path.join(root, f)
                try:
                    content = open(p, encoding='utf-8', errors='ignore').read()
                    if re.search(r'sk-[a-zA-Z0-9]{20,}', content):
                        leak.append(os.path.relpath(p, DIST))
                except Exception:
                    pass
    if leak:
        for l in leak:
            err(f'dist 文件含疑似 API Key: {l}')
    else:
        ok('无 API Key 泄漏')

# ─── 3. 前端语法 ─────────────────────────────
section('3. 前端语法检查')
fe = os.path.join(ROOT, '02-Mac版', 'flask-app', 'static', 'index.html')
content = open(fe, encoding='utf-8').read()
scripts = re.findall(r'<script>(.*?)</script>', content, re.S)
tmp = os.path.join(os.environ.get('TEMP', '.'), '_prerelease_fe.js')
open(tmp, 'w', encoding='utf-8').write('\n'.join(scripts))
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
if r.returncode == 0:
    ok(f'index.html JS 语法正确 ({sum(len(s) for s in scripts)} 字符)')
else:
    err('前端 JS 语法错误: ' + r.stderr[:200])

# ─── 4. 后端语法 ─────────────────────────────
section('4. 后端语法检查')
r = subprocess.run([sys.executable, '-m', 'py_compile',
                    os.path.join(ROOT, '02-Mac版', 'flask-app', 'app.py')],
                   capture_output=True, text=True)
if r.returncode == 0:
    ok('app.py 编译通过')
else:
    err('app.py 语法错误: ' + r.stderr[:200])

r = subprocess.run(['node', '--check', os.path.join(WIN, 'main.js')],
                   capture_output=True, text=True, cwd=WIN)
if r.returncode == 0:
    ok('main.js 语法正确')
else:
    err('main.js 语法错误: ' + r.stderr[:200])

# ─── 5. 全仓库源码 Key 泄漏扫描 ─────────────────────
section('5. 源码 Key/token 扫描')
SCAN_DIRS = ['02-Mac版/flask-app/static', '02-Mac版/flask-app/app.py',
             '03-Android版/www', 'web', '01-Windows版/main.js']
leak = []
for item in SCAN_DIRS:
    full = os.path.join(ROOT, item)
    paths = []
    if os.path.isfile(full):
        paths = [full]
    elif os.path.isdir(full):
        for root, dirs, files in os.walk(full):
            dirs[:] = [d for d in dirs if d not in ('node_modules', 'lib')]
            paths += [os.path.join(root, f) for f in files]
    for p in paths:
        try:
            c = open(p, encoding='utf-8', errors='ignore').read()
            # sk- 开头的真实 key（排除占位符/文档示例）
            for mm in re.finditer(r'sk-[a-zA-Z0-9]{28,}', c):
                leak.append((os.path.relpath(p, ROOT), mm.group(0)[:12] + '...'))
        except Exception:
            pass
if leak:
    for l in leak:
        err(f'源码泄漏 Key: {l[0]} → {l[1]}')
else:
    ok('无泄漏')

# ─── 汇总 ─────────────────────────────
print('\n' + '=' * 50)
if errors:
    print(f'❌ 未通过: {len(errors)} 个错误, {len(warnings)} 个警告')
    for e in errors:
        print('  ❌', e)
    sys.exit(1)
else:
    print(f'✅ 全部通过 ({len(warnings)} 个警告)')
    sys.exit(0)
