"""
务思语 Electron 版 安装/更新程序
首次安装 → 复制全部 + 桌面快捷方式
检测到旧版 → 只替换 app 文件，保留 books
"""
import os, sys, shutil, subprocess, tkinter as tk
from tkinter import filedialog, messagebox

APP_NAME = "务思语"
APP_EXE = "务思语.exe"
APP_DIR = "务思语-win32-x64"
VERSION = "1.5"
PATH_FILE = os.path.join(os.path.expanduser('~'), 'AppData', 'Local', '务思语_install_path.txt')

if getattr(sys, 'frozen', False):
    SRC_DIR = sys._MEIPASS
else:
    SRC_DIR = os.path.dirname(sys.argv[0])

SRC_APP = os.path.join(SRC_DIR, APP_DIR)


def powershell(cmd):
    subprocess.run(['powershell', '-NoProfile', '-Command', cmd],
                   capture_output=True, timeout=10)


def mklnk(target, lnk_path):
    """用 VBScript 创建快捷方式（比 PowerShell 更稳，无编码问题）"""
    d = os.path.dirname(target)
    vbs = f'''
    Set ws = CreateObject("WScript.Shell")
    Set lnk = ws.CreateShortcut("{lnk_path}")
    lnk.TargetPath = "{target}"
    lnk.WorkingDirectory = "{d}"
    lnk.Description = "务思语 - 英语沉浸阅读器"
    lnk.Save()
    '''
    vbs_file = os.path.join(os.environ.get('TEMP', '.'), '_wusiyu_lnk.vbs')
    try:
        with open(vbs_file, 'w', encoding='utf-8') as f:
            f.write(vbs)
        subprocess.run(['cscript', '//NoLogo', vbs_file],
                       capture_output=True, timeout=10)
    finally:
        try: os.remove(vbs_file)
        except: pass


def get_desktop():
    ps = "[Environment]::GetFolderPath('Desktop')"
    try:
        r = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                           capture_output=True, text=True, timeout=5,
                           encoding='utf-8', errors='ignore')
        p = r.stdout.strip()
        if p and os.path.isdir(p):
            return p
    except: pass
    # 兜底
    fallback = os.path.join(os.path.expanduser('~'), 'Desktop')
    return fallback if os.path.isdir(fallback) else None


def copy_safe(src, dst):
    """复制文件/目录，跳过已存在的同名子目录"""
    if os.path.isfile(src):
        shutil.copy2(src, dst)
    else:
        base = os.path.basename(src)
        tgt = os.path.join(dst, base)
        if os.path.exists(tgt):
            shutil.rmtree(tgt, ignore_errors=True)
        shutil.copytree(src, tgt)


def stop_app():
    """关掉正在运行的务思语"""
    subprocess.run(['taskkill', '/F', '/IM', APP_EXE],
                   capture_output=True, timeout=5)
    import time; time.sleep(2)


def detect_existing():
    """检测是否已有安装"""
    # 先从记忆文件读
    saved = load_install_path()
    if saved and os.path.isfile(os.path.join(saved, APP_EXE)):
        return saved

    # 再检查常见目录
    candidates = [
        os.path.join(os.path.expanduser('~'), 'Desktop', APP_NAME, APP_EXE),
        os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), APP_NAME, APP_EXE),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', APP_NAME, APP_EXE),
        # 用户可能装过的位置
        os.path.join('E:\\Hermes Works', '读书软件', APP_EXE),
        os.path.join('E:\\Hermes Works', '务思语', 'dist', '务思语', APP_EXE),
        os.path.join('E:\\Hermes Works', '务思语', APP_EXE),
    ]

    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.dirname(c)

    # 最后：扫描桌面所有快捷方式，找指向务思语的
    desk = get_desktop()
    if desk:
        try:
            ps = f'''
            Get-ChildItem "{desk}\\*.lnk" | ForEach-Object {{
                $s = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName)
                if ($s.TargetPath -like "*{APP_EXE}") {{ Write-Host $s.TargetPath }}
            }}
            '''
            r = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                               capture_output=True, text=True, timeout=10,
                               encoding='utf-8', errors='ignore')
            for line in r.stdout.strip().split('\n'):
                line = line.strip()
                if line and os.path.isfile(line):
                    return os.path.dirname(line)
        except: pass

    return None


def save_install_path(dest):
    try:
        with open(PATH_FILE, 'w', encoding='utf-8') as f:
            f.write(dest)
    except: pass


def load_install_path():
    try:
        if os.path.isfile(PATH_FILE):
            with open(PATH_FILE, 'r', encoding='utf-8') as f:
                return f.read().strip()
    except: pass
    return None


def install():
    dest = dir_var.get()
    if not dest:
        messagebox.showerror("错误", "请选择安装目录")
        return

    is_update = os.path.exists(os.path.join(dest, APP_EXE))

    if is_update:
        if not messagebox.askyesno("检测到已有安装",
            f"目录中已存在务思语，将执行更新：\n"
            f"• 替换程序文件\n"
            f"• 保留您的书籍和配置\n\n"
            f"是否继续？"):
            return
        stop_app()
        mode = "正在更新..."
        done = f"✅ 更新完成！v{VERSION}"
    else:
        mode = "正在安装..."
        done = f"✅ 安装完成！v{VERSION}"

    progress.config(text=mode)
    root.update()

    try:
        # 复制 Electron 应用目录（更新时跳过 books）
        skip_dirs = set()
        if is_update:
            skip_dirs.add(os.path.normpath(os.path.join(SRC_APP, 'resources', 'flask-app', 'books')))

        for item in os.listdir(SRC_APP):
            s = os.path.join(SRC_APP, item)
            d = os.path.join(dest, item)
            if os.path.isfile(s):
                shutil.copy2(s, d)
            else:
                # 检查是否在跳过列表中
                if os.path.normpath(s) in skip_dirs:
                    continue
                if os.path.exists(d):
                    shutil.rmtree(d, ignore_errors=True)
                shutil.copytree(s, d)

        # 如果是首次安装，复制示例书
        if not is_update:
            src_books = os.path.join(SRC_APP, 'resources', 'flask-app', 'books')
            dst_books = os.path.join(dest, 'resources', 'flask-app', 'books')
            if os.path.exists(src_books) and not os.path.exists(dst_books):
                os.makedirs(dst_books, exist_ok=True)
                for f in os.listdir(src_books):
                    shutil.copy2(os.path.join(src_books, f), os.path.join(dst_books, f))

        # 快捷方式
        exe_path = os.path.join(dest, APP_EXE)
        desk = get_desktop()
        if desk:
            mklnk(exe_path, os.path.join(desk, f"{APP_NAME}.lnk"))

        # 开始菜单快捷方式
        sm = os.path.join(os.path.expanduser('~'),
            'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
        if os.path.exists(sm):
            mklnk(exe_path, os.path.join(sm, f"{APP_NAME}.lnk"))

        progress.config(text=done)
        install_btn.config(state=tk.DISABLED, text=done)
        open_btn.config(state=tk.NORMAL)
        open_btn._dest = dest
        save_install_path(dest)  # 记住安装位置

        msg = f"务思语 v{VERSION} Electron 版\n\n{dest}\n\n桌面快捷方式已创建\n"
        if is_update:
            msg += "\n您的书籍和配置已保留。"
        msg += "\n\n是否现在启动？"

        messagebox.showinfo(done, msg)
        if messagebox.askyesno("启动", "立即启动？"):
            subprocess.Popen([exe_path], cwd=dest)

    except Exception as e:
        messagebox.showerror("失败", str(e))
        progress.config(text="❌ 失败")


def browse():
    d = filedialog.askdirectory(title="选择安装目录", initialdir=dir_var.get())
    if d:
        dir_var.set(d)
        if os.path.exists(os.path.join(d, APP_EXE)):
            status.config(text="⚠️ 已存在，将执行更新", fg='#d97706')
            install_btn.config(text="更新到 v" + VERSION)
        else:
            status.config(text="")
            install_btn.config(text="开始安装")


def open_dir():
    d = getattr(open_btn, '_dest', None)
    if d: os.startfile(d)


# ─── GUI ────────────────────────────────────────
root = tk.Tk()
root.title(f"{APP_NAME} 安装程序 v{VERSION}")
root.geometry("520x480")
root.resizable(False, False)
root.configure(bg='#fafaf9')
FONT = ('Microsoft YaHei UI', 10)
FONT_TITLE = ('Microsoft YaHei UI', 16, 'bold')

tk.Frame(root, bg='#3b82f6', height=90).pack(fill='x')

title_f = tk.Frame(root, bg='#3b82f6', height=90)
title_f.pack(fill='x')
title_f.pack_propagate(False)
tk.Label(title_f, text="📖 务思语", font=FONT_TITLE, bg='#3b82f6', fg='white').place(relx=0.5, rely=0.4, anchor='center')
tk.Label(title_f, text=f"Electron 原生窗口版  v{VERSION}",
    font=('Microsoft YaHei UI', 9), bg='#3b82f6', fg='#dbeafe').place(relx=0.5, rely=0.75, anchor='center')

main = tk.Frame(root, bg='#fafaf9', padx=30, pady=20)
main.pack(fill='both', expand=True)

tk.Label(main, text="安装目录:", font=FONT, bg='#fafaf9', anchor='w').pack(fill='x')
f = tk.Frame(main, bg='#fafaf9')
f.pack(fill='x', pady=(6, 6))

dir_var = tk.StringVar()
existing = detect_existing()
if existing:
    dir_var.set(existing)
else:
    dir_var.set(os.path.join(os.path.expanduser('~'), 'Desktop', APP_NAME))

tk.Entry(f, textvariable=dir_var, font=FONT, bg='white', relief='solid', bd=1).pack(
    side='left', fill='x', expand=True, ipady=4)
tk.Button(f, text="浏览...", command=browse, font=FONT, bg='#e5e7eb', relief='flat', padx=12).pack(side='right', padx=(8, 0))

status = tk.Label(main, text="", font=('Microsoft YaHei UI', 9), bg='#fafaf9', anchor='w')
status.pack(fill='x', pady=(0, 10))
if existing:
    status.config(text="✅ 检测到已有安装，将执行更新（保留书和配置）", fg='#16a34a')

info = "📖 原生窗口 · 无浏览器地址栏\n📚 TXT · EPUB · PDF · DOCX · HTML\n🖱️ 点击查词 · 单词本 · 背单词 · 记忆曲线"
tk.Label(main, text=info, font=('Microsoft YaHei UI', 9),
    bg='#fafaf9', fg='#6b7280', justify='left').pack(pady=(0, 15))

progress = tk.Label(main, text="", font=FONT, bg='#fafaf9', fg='#3b82f6')
progress.pack()

btn_text = f"更新到 v{VERSION}" if existing else "开始安装"
install_btn = tk.Button(main, text=btn_text, command=install,
    font=('Microsoft YaHei UI', 12, 'bold'), bg='#3b82f6', fg='white', relief='flat',
    padx=30, pady=8, cursor='hand2')
install_btn.pack(pady=(5, 0))

open_btn = tk.Button(main, text="打开安装目录", command=open_dir,
    font=FONT, bg='#fafaf9', fg='#3b82f6', relief='flat', state=tk.DISABLED)
open_btn.pack(pady=(8, 0))

tk.Label(main, text=f"{APP_NAME} v{VERSION}  |  增量更新  |  保留书籍配置",
    font=('Microsoft YaHei UI', 8), bg='#fafaf9', fg='#9ca3af').pack(side='bottom', pady=(10, 0))

root.mainloop()
