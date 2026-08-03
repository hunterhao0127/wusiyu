"""
务思语 安装/更新程序
- 首次安装：复制全部文件 + 创建快捷方式
- 检测到旧版：只替换程序文件，保留书籍和配置
"""
import os
import sys
import shutil
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox

# ─── 版本 ─────────────────────────────────────────
APP_NAME = "务思语"
APP_EXE = "务思语.exe"
APP_VERSION = "1.5.1"
VERSION_FILE = "务思语_version.txt"

# PyInstaller 打包后，嵌入的文件在 _MEIPASS 中
if getattr(sys, 'frozen', False):
    SRC_DIR = sys._MEIPASS
else:
    SRC_DIR = os.path.dirname(sys.argv[0])

DEFAULT_INSTALL_DIR = os.path.expanduser(f"~/Desktop/{APP_NAME}")
PATH_FILE = os.path.join(os.path.expanduser('~'), 'AppData', 'Local', '务思语_install_path.txt')


def get_desktop():
    return os.path.join(os.path.expanduser('~'), 'Desktop')


def get_desktop_real():
    """获取真实桌面路径（含 OneDrive 重定向）"""
    try:
        ps = "[Environment]::GetFolderPath('Desktop')"
        r = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                           capture_output=True, text=True, timeout=5,
                           encoding='utf-8', errors='ignore')
        p = r.stdout.strip()
        if p and os.path.isdir(p):
            return p
    except: pass
    return get_desktop()


def save_install_path(dest):
    """记住安装位置，下次更新自动找到"""
    try:
        with open(PATH_FILE, 'w', encoding='utf-8') as f:
            f.write(dest)
    except: pass


def load_install_path():
    """读取记忆的安装位置"""
    try:
        if os.path.isfile(PATH_FILE):
            with open(PATH_FILE, 'r', encoding='utf-8') as f:
                return f.read().strip()
    except: pass
    return None


def create_shortcut(target_path, shortcut_name, description=""):
    """用 PowerShell 创建快捷方式"""
    ps_script = f'''
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut("{shortcut_name}")
    $Shortcut.TargetPath = "{target_path}"
    $Shortcut.Description = "{description}"
    $Shortcut.WorkingDirectory = "{os.path.dirname(target_path)}"
    $Shortcut.Save()
    '''
    subprocess.run(['powershell', '-Command', ps_script], capture_output=True)


def get_installed_version(dest):
    """检测目标目录是否已有安装，返回版本号"""
    version_path = os.path.join(dest, VERSION_FILE)
    if os.path.exists(version_path):
        with open(version_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    # 兼容旧版：没有版本文件但存在 exe 也算已安装
    if os.path.exists(os.path.join(dest, APP_EXE)):
        return "旧版"
    return None


def copy_item(src, dst, item_name):
    """安全复制单个文件或目录"""
    src_path = os.path.join(src, item_name)
    dst_path = os.path.join(dst, item_name)
    if not os.path.exists(src_path):
        return False
    if os.path.isfile(src_path):
        # 复制前先解除文件占用（如有旧进程在运行）
        retry_copy(src_path, dst_path)
    elif os.path.isdir(src_path):
        if os.path.exists(dst_path):
            shutil.rmtree(dst_path, ignore_errors=True)
        shutil.copytree(src_path, dst_path)
    return True


def retry_copy(src, dst, max_attempts=8):
    """带重试的文件复制，遇到 Permission denied 时等进程释放"""
    for attempt in range(max_attempts):
        try:
            shutil.copy2(src, dst)
            return
        except PermissionError:
            if attempt < max_attempts - 1:
                import time
                time.sleep(1)  # 每次等 1 秒
            else:
                raise


def stop_running_app(dest):
    """终止所有正在运行的务思语进程"""
    import time as t
    killed = False

    try:
        result = subprocess.run(
            ['taskkill', '/F', '/IM', f'{APP_EXE}'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            killed = True
    except:
        pass

    if killed:
        t.sleep(2)  # 等进程完全退出释放文件句柄
    return killed


def install():
    """执行安装或更新"""
    dest = install_dir_var.get()
    if not dest:
        messagebox.showerror("错误", "请选择安装目录")
        return

    # 先杀旧进程，释放文件锁
    stop_running_app(dest)

    try:
        os.makedirs(dest, exist_ok=True)
    except Exception as e:
        messagebox.showerror("错误", f"无法创建目录:\n{e}")
        return

    # 检测是否已有安装
    old_version = get_installed_version(dest)
    is_update = old_version is not None

    if is_update:
        msg = (f"检测到已有安装 (版本: {old_version})\n\n"
               f"将执行更新操作:\n"
               f"•  替换程序文件\n"
               f"•  保留您的书籍和设置\n\n"
               f"目录: {dest}\n\n"
               f"是否继续？")
        if not messagebox.askyesno("发现旧版本", msg):
            return

        # 更新前自动关闭正在运行的务思语
        if stop_running_app(dest):
            progress_label.config(text="已关闭旧进程，正在更新...")
            root.update()
            import time
            time.sleep(0.5)

        mode_text = f"正在更新 {APP_NAME}..."
        done_text = f"✅ 更新完成！(v{old_version} → v{APP_VERSION})"
    else:
        mode_text = "正在安装..."
        done_text = "✅ 安装完成！"

    progress_label.config(text=mode_text)
    root.update()

    try:
        # ── 更新模式：只替换程序文件 ──
        if is_update:
            items_to_update = [APP_EXE, '_internal']
            for item in items_to_update:
                copy_item(SRC_DIR, dest, item)

            # 更新版本文件
            with open(os.path.join(dest, VERSION_FILE), 'w', encoding='utf-8') as f:
                f.write(APP_VERSION)
            save_install_path(dest)  # 记住安装位置

            # 确保快捷方式存在
            desktop = get_desktop_real()
            shortcut_path = os.path.join(desktop, f"{APP_NAME}.lnk")
            exe_path = os.path.join(dest, APP_EXE)
            if not os.path.exists(shortcut_path):
                create_shortcut(exe_path, shortcut_path, "务思语 - 英语沉浸阅读器")

            # 开始菜单快捷方式
            start_menu = os.path.join(
                os.path.expanduser('~'),
                'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'
            )
            start_shortcut = os.path.join(start_menu, f"{APP_NAME}.lnk")
            if not os.path.exists(start_shortcut):
                create_shortcut(exe_path, start_shortcut, "务思语 - 英语沉浸阅读器")

            progress_label.config(text=done_text)

            # 更新按钮状态
            install_btn.config(state=tk.DISABLED, text=f"✅ v{APP_VERSION} 已安装")
            open_btn.config(state=tk.NORMAL)
            open_btn.install_dir = dest

            messagebox.showinfo(
                "更新完成",
                f"务思语 已从 v{old_version} 更新到 v{APP_VERSION}\n\n"
                f"您的书籍和设置已保留。\n\n"
                f"是否现在启动？"
            )
            if messagebox.askyesno("启动", "立即启动务思语？"):
                subprocess.Popen([exe_path], cwd=dest)

        # ── 全新安装：复制全部文件 ──
        else:
            items_to_install = [APP_EXE, '_internal', 'books']
            for item in items_to_install:
                copy_item(SRC_DIR, dest, item)

            # 写入版本文件
            with open(os.path.join(dest, VERSION_FILE), 'w', encoding='utf-8') as f:
                f.write(APP_VERSION)
            save_install_path(dest)  # 记住安装位置

            # 桌面快捷方式
            desktop = get_desktop_real()
            shortcut_path = os.path.join(desktop, f"{APP_NAME}.lnk")
            exe_path = os.path.join(dest, APP_EXE)
            create_shortcut(exe_path, shortcut_path, "务思语 - 英语沉浸阅读器")

            # 开始菜单快捷方式
            start_menu = os.path.join(
                os.path.expanduser('~'),
                'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'
            )
            start_shortcut = os.path.join(start_menu, f"{APP_NAME}.lnk")
            create_shortcut(exe_path, start_shortcut, "务思语 - 英语沉浸阅读器")

            progress_label.config(text=done_text)

            install_btn.config(state=tk.DISABLED, text=f"✅ v{APP_VERSION} 已安装")
            open_btn.config(state=tk.NORMAL)
            open_btn.install_dir = dest

            messagebox.showinfo(
                "安装完成",
                f"务思语 v{APP_VERSION} 已安装到:\n{dest}\n\n"
                f"桌面和开始菜单已添加快捷方式。\n\n"
                f"是否现在启动？"
            )
            if messagebox.askyesno("启动", "立即启动务思语？"):
                subprocess.Popen([exe_path], cwd=dest)

    except Exception as e:
        messagebox.showerror("失败", f"操作失败:\n{e}")
        progress_label.config(text="❌ 失败")


def browse():
    """选择安装目录，并自动检测是否有旧版本"""
    initial = install_dir_var.get()
    d = filedialog.askdirectory(title="选择安装目录", initialdir=initial)
    if d:
        install_dir_var.set(d)
        # 检测旧版本并更新提示
        ver = get_installed_version(d)
        if ver:
            status_label.config(
                text=f"⚠️ 检测到已有安装 (v{ver})，将执行更新",
                fg='#d97706'
            )
            install_btn.config(text=f"更新到 v{APP_VERSION}")
        else:
            status_label.config(text="")
            install_btn.config(text="开始安装")


def open_install_dir():
    d = getattr(open_btn, 'install_dir', None)
    if d and os.path.exists(d):
        os.startfile(d)


# ─── 自动检测已有安装位置 ────────────────────────
def detect_existing_install():
    """自动检测已有安装位置（记忆文件 → 桌面快捷方式 → 常见目录）"""
    # 1. 记忆文件优先
    saved = load_install_path()
    if saved and os.path.isfile(os.path.join(saved, APP_EXE)):
        return saved

    # 2. 扫描桌面所有快捷方式（无论叫什么名字）
    desktop = get_desktop_real()
    try:
        ps = f'''
        Get-ChildItem "{desktop}\\*.lnk" | ForEach-Object {{
            $s = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName)
            if ($s.TargetPath -like "*{APP_EXE}") {{ Write-Host $s.TargetPath }}
        }}
        '''
        result = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                                capture_output=True, text=True, timeout=10,
                                encoding='utf-8', errors='ignore')
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if line and line.lower().endswith(APP_EXE.lower()) and os.path.isfile(line):
                return os.path.dirname(line)
    except: pass

    # 3. 常见目录
    candidates = [
        os.path.join(desktop, APP_NAME, APP_EXE),
        os.path.join('E:\\Hermes Works', '阅读软件', APP_EXE),
        os.path.join('E:\\Hermes Works', '读书软件', APP_EXE),
        os.path.join('E:\\Hermes Works', '务思语项目', '05-已安装副本', APP_EXE),
        os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), APP_NAME, APP_EXE),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.dirname(c)
    return None


# ─── GUI ───────────────────────────────────────────
root = tk.Tk()
root.title(f"{APP_NAME} 安装程序 v{APP_VERSION}")
root.geometry("540x420")
root.resizable(False, False)
root.update_idletasks()
w = root.winfo_width()
h = root.winfo_height()
x = (root.winfo_screenwidth() // 2) - (w // 2)
y = (root.winfo_screenheight() // 2) - (h // 2)
root.geometry(f"+{x}+{y}")
root.configure(bg='#fafaf9')

FONT = ('Microsoft YaHei UI', 10)
FONT_TITLE = ('Microsoft YaHei UI', 16, 'bold')
FONT_SMALL = ('Microsoft YaHei UI', 9)

# ── 标题 ──
title_frame = tk.Frame(root, bg='#3b82f6', height=100)
title_frame.pack(fill='x')
title_frame.pack_propagate(False)

tk.Label(
    title_frame, text="📖 务思语", font=FONT_TITLE,
    bg='#3b82f6', fg='white'
).pack(pady=(15, 0))

tk.Label(
    title_frame, text=f"英语沉浸阅读器  v{APP_VERSION}", font=FONT_SMALL,
    bg='#3b82f6', fg='#dbeafe'
).pack()

# ── 主内容 ──
main_frame = tk.Frame(root, bg='#fafaf9', padx=30, pady=20)
main_frame.pack(fill='both', expand=True)

tk.Label(
    main_frame, text="安装目录:", font=FONT,
    bg='#fafaf9', fg='#1a1a2e', anchor='w'
).pack(fill='x')

dir_frame = tk.Frame(main_frame, bg='#fafaf9')
dir_frame.pack(fill='x', pady=(6, 6))

install_dir_var = tk.StringVar()

# 自动检测已有安装
existing = detect_existing_install()
if existing:
    install_dir_var.set(existing)
else:
    install_dir_var.set(DEFAULT_INSTALL_DIR)

dir_entry = tk.Entry(
    dir_frame, textvariable=install_dir_var, font=FONT,
    bg='white', fg='#1a1a2e', relief='solid', bd=1
)
dir_entry.pack(side='left', fill='x', expand=True, ipady=4)

browse_btn = tk.Button(
    dir_frame, text="浏览...", command=browse,
    font=FONT, bg='#e5e7eb', fg='#1a1a2e',
    relief='flat', padx=12, cursor='hand2'
)
browse_btn.pack(side='right', padx=(8, 0))

# 状态提示
status_label = tk.Label(
    main_frame, text="", font=FONT_SMALL,
    bg='#fafaf9', anchor='w'
)
status_label.pack(fill='x', pady=(0, 15))

# 如果检测到已有安装，显示提示
if existing:
    ver = get_installed_version(existing)
    status_label.config(
        text=f"⚠️ 检测到已有安装 (v{ver})，将执行更新（保留书和设置）",
        fg='#d97706'
    )

# 功能介绍
features_text = "📚 TXT · EPUB · PDF · DOCX · HTML\n🖱️ 点击查词 · 选中翻译 · 阅读历史 · 跳转"
tk.Label(
    main_frame, text=features_text, font=FONT_SMALL,
    bg='#fafaf9', fg='#6b7280', justify='left'
).pack(pady=(0, 15))

# 进度
progress_label = tk.Label(
    main_frame, text="", font=FONT, bg='#fafaf9', fg='#3b82f6'
)
progress_label.pack()

# 安装/更新按钮
btn_text = f"更新到 v{APP_VERSION}" if existing else "开始安装"
install_btn = tk.Button(
    main_frame, text=btn_text, command=install,
    font=('Microsoft YaHei UI', 12, 'bold'),
    bg='#3b82f6', fg='white', relief='flat',
    padx=30, pady=8, cursor='hand2',
    activebackground='#2563eb', activeforeground='white'
)
install_btn.pack(pady=(5, 0))
install_btn.bind('<Enter>', lambda e: install_btn.configure(bg='#2563eb'))
install_btn.bind('<Leave>', lambda e: install_btn.configure(bg='#3b82f6'))

# 打开目录按钮
open_btn = tk.Button(
    main_frame, text="打开安装目录", command=open_install_dir,
    font=FONT, bg='#fafaf9', fg='#3b82f6',
    relief='flat', state=tk.DISABLED, cursor='hand2'
)
open_btn.pack(pady=(10, 0))

# 底部
tk.Label(
    main_frame,
    text=f"{APP_NAME} v{APP_VERSION}  |  支持增量更新  |  保留书籍和配置",
    font=('Microsoft YaHei UI', 8), bg='#fafaf9', fg='#9ca3af'
).pack(side='bottom', pady=(10, 0))

root.mainloop()
