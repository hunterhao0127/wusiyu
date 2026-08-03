"""
务思语 - 英语沉浸式阅读器
Flask 后端: 书籍解析 + AI 翻译 (DeepSeek API)
"""

import os
import re
import json
import glob
import sys
import webbrowser
import threading
import requests
from flask import Flask, request, jsonify, send_from_directory, render_template_string

# ─── PyInstaller 打包路径支持 ─────────────────────────
def base_path():
    """获取程序基础路径（打包 exe 时取 exe 所在目录）"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(__file__)


def resource_path(relative_path):
    """获取资源文件路径（打包后从 _MEIPASS 取静态资源）"""
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(__file__), relative_path)


app = Flask(__name__, static_folder=resource_path('static'), static_url_path='')

# ─── 配置 ────────────────────────────────────────────────────
# 书籍和配置存在 exe 旁边（用户数据）
APP_DIR = base_path()
BOOKS_DIR = os.path.join(APP_DIR, 'books')
CONFIG_FILE = os.path.join(APP_DIR, 'config.json')
VERSION_FILE = os.path.join(APP_DIR, '务思语_version.txt')
APP_VERSION = "1.5.1"

DEFAULT_CONFIG = {
    "api_key": "",
    "api_base": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "provider": "deepseek"
}


def load_config():
    """加载配置"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            # 合并默认值
            for k, v in DEFAULT_CONFIG.items():
                cfg.setdefault(k, v)
            return cfg
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    """保存配置"""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ─── 书籍解析 ────────────────────────────────────────────────

def parse_txt(filepath):
    """解析 TXT 文件，按空行分段落"""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    # 按两个以上换行分割为段落
    paragraphs = re.split(r'\n\s*\n', text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    # 尝试识别章节标题
    chapters = detect_chapters(paragraphs)

    return {
        "title": os.path.splitext(os.path.basename(filepath))[0],
        "paragraphs": paragraphs,
        "chapters": chapters,
        "total": len(paragraphs)
    }


def parse_epub(filepath):
    """解析 EPUB 文件"""
    from ebooklib import epub
    book = epub.read_epub(filepath)

    paragraphs = []
    title = os.path.splitext(os.path.basename(filepath))[0]

    for item in book.get_items():
        if item.get_type() == 9:  # ITEM_DOCUMENT
            content = item.get_body_content().decode('utf-8', errors='replace')
            # 提取文本
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, 'lxml')
            text = soup.get_text(separator='\n', strip=True)
            # 按空行分段落
            parts = re.split(r'\n\s*\n', text)
            for p in parts:
                p = p.strip()
                if p and len(p) > 10:
                    paragraphs.append(p)

    if not paragraphs:
        # 兜底：直接取所有文本
        for item in book.get_items():
            if item.get_type() == 9:
                content = item.get_body_content().decode('utf-8', errors='replace')
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(content, 'lxml')
                text = soup.get_text(separator=' ', strip=True)
                sentences = re.split(r'(?<=[.!?])\s+', text)
                for s in sentences:
                    s = s.strip()
                    if s and len(s) > 15:
                        paragraphs.append(s)

    chapters = detect_chapters(paragraphs)

    return {
        "title": title,
        "paragraphs": paragraphs,
        "chapters": chapters,
        "total": len(paragraphs)
    }


def parse_pdf(filepath):
    """解析 PDF 文件"""
    import fitz  # PyMuPDF
    doc = fitz.open(filepath)

    paragraphs = []
    title = os.path.splitext(os.path.basename(filepath))[0]

    for page_num in range(doc.page_count):
        page = doc[page_num]
        text = page.get_text("text", sort=True)
        if not text or not text.strip():
            continue
        # 按空行分段落
        parts = re.split(r'\n\s*\n', text)
        for p in parts:
            p = p.strip()
            if p and len(p) > 10:
                paragraphs.append(p)

    doc.close()
    chapters = detect_chapters(paragraphs)

    return {
        "title": title,
        "paragraphs": paragraphs,
        "chapters": chapters,
        "total": len(paragraphs)
    }


def parse_docx(filepath):
    """解析 DOCX 文件"""
    from docx import Document
    doc = Document(filepath)

    paragraphs = []
    for p in doc.paragraphs:
        text = p.text.strip()
        if text and len(text) > 5:
            paragraphs.append(text)

    title = os.path.splitext(os.path.basename(filepath))[0]
    chapters = detect_chapters(paragraphs)

    return {
        "title": title,
        "paragraphs": paragraphs,
        "chapters": chapters,
        "total": len(paragraphs)
    }


def parse_html(filepath):
    """解析 HTML/HTM 文件"""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'lxml')

    # 删除 script/style
    for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
        tag.decompose()

    text = soup.get_text(separator='\n', strip=True)
    paragraphs = []
    for line in text.split('\n'):
        line = line.strip()
        if line and len(line) > 10:
            paragraphs.append(line)

    title = os.path.splitext(os.path.basename(filepath))[0]
    chapters = detect_chapters(paragraphs)

    return {
        "title": title,
        "paragraphs": paragraphs,
        "chapters": chapters,
        "total": len(paragraphs)
    }


def detect_chapters(paragraphs):
    """从段落中检测章节标题"""
    chapters = []
    current_chapter = {"title": "开头", "start": 0}
    for i, p in enumerate(paragraphs):
        # 匹配各种章节标题模式
        if re.match(r'^(Chapter|Unit|Lesson|Part|Section|CHAPTER|Module|Week)', p, re.IGNORECASE) or \
           re.match(r'^(Interlude|Prologue|Epilogue|Appendix|Preface|Introduction)', p, re.IGNORECASE) or \
           re.match(r'^(插曲|间奏|幕间|番外|序章|终章|附录|前言|引言)', p) or \
           re.match(r'^\d+[\.\s]', p) or \
           (re.match(r'^[A-Z][a-z]+\s', p) and len(p) < 60 and len(p) > 3):
            if current_chapter["start"] < i:
                chapters.append(dict(current_chapter))
            current_chapter = {"title": p, "start": i}
    chapters.append(dict(current_chapter))
    return chapters


# 支持的文件格式
SUPPORTED_FORMATS = {
    '.txt': '📄 TXT',
    '.epub': '📘 EPUB',
    '.pdf': '📕 PDF',
    '.docx': '📋 DOCX',
    '.html': '🌐 HTML',
    '.htm': '🌐 HTML',
}


def list_books():
    """列出所有书籍文件"""
    supported = list(SUPPORTED_FORMATS.keys())
    books = []
    for pattern in ['*' + e for e in supported]:
        for f in glob.glob(os.path.join(BOOKS_DIR, pattern)):
            name = os.path.splitext(os.path.basename(f))[0]
            ext = os.path.splitext(os.path.basename(f))[1].lower()
            size = os.path.getsize(f)
            books.append({
                "name": name,
                "filename": os.path.basename(f),
                "ext": ext,
                "format_label": SUPPORTED_FORMATS.get(ext, '📄'),
                "size": size,
                "size_str": format_size(size)
            })
    return books


def format_size(size):
    """格式化文件大小"""
    if size < 1024:
        return f"{size}B"
    elif size < 1024 * 1024:
        return f"{size/1024:.1f}KB"
    else:
        return f"{size/(1024*1024):.1f}MB"


# ─── AI 翻译 ──────────────────────────────────────────────────

def call_ai_api(messages, config):
    """调用 DeepSeek API"""
    api_key = config.get("api_key", "")
    api_base = config.get("api_base", "https://api.deepseek.com/v1")
    model = config.get("model", "deepseek-chat")

    if not api_key:
        return {"error": "请先在设置中配置 API Key"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 600
    }

    try:
        resp = requests.post(
            f"{api_base.rstrip('/')}/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return {"content": content.strip()}
    except requests.exceptions.Timeout:
        return {"error": "请求超时，请检查网络"}
    except requests.exceptions.ConnectionError:
        return {"error": "无法连接到 API 服务器"}
    except requests.exceptions.HTTPError as e:
        return {"error": f"API 返回错误: {e.response.status_code}"}
    except (KeyError, json.JSONDecodeError) as e:
        return {"error": f"解析响应失败: {str(e)}"}
    except Exception as e:
        return {"error": f"未知错误: {str(e)}"}


def translate_word(word, mode="simple", config=None):
    """翻译单词: simple=精简, detailed=详细"""
    if config is None:
        config = load_config()

    word = word.strip().strip(",.!?;:\"'()[]{}").strip()
    if not word or len(word) > 50:
        return {"error": "无效的单词"}

    if mode == "simple":
        prompt = (
            f"You are an English-Chinese dictionary. Translate the English word '{word}'.\n"
            f"Output format (keep it concise, 5 lines max):\n"
            f"Word: {word}\n"
            f"British: /.../\n"
            f"American: /.../\n"
            f"Difficulty: [CEFR等级] [中文描述]\n"
            f"释义: [词性] 中文释义（简洁）\n"
            f"只用中文回复，不要额外解释。"
        )
    else:
        prompt = (
            f"You are an English-Chinese dictionary. Provide a detailed analysis for '{word}'.\n"
            f"Output format:\n"
            f"【单词】{word}\n"
            f"【英式发音】/.../\n"
            f"【美式发音】/.../\n"
            f"【难度等级】[CEFR等级] [中文描述]\n"
            f"【英文释义】[English definition in plain English, like Cambridge/Oxford dictionary style]\n"
            f"【词性】...\n"
            f"【释义】1. [English meaning (in English)] — 中文释义 ⬅️ 本句\n"
            f"        2. [English meaning (in English)] — 中文释义\n"
            f"        (列出所有主要含义，并在当前语境最可能的意思后面加 ⬅️ 本句)\n"
            f"【例句】1. ...  → 中文翻译\n"
            f"【同义词】...\n"
            f"【反义词】...\n"
            f"尽量全面，用中文+英文双语回复。"
        )

    messages = [
        {"role": "system", "content": "你是专业的英汉词典助手，输出简洁准确。"},
        {"role": "user", "content": prompt}
    ]

    return call_ai_api(messages, config)


def translate_sentence(sentence, config=None):
    """翻译句子"""
    if config is None:
        config = load_config()

    sentence = sentence.strip()
    if not sentence or len(sentence) > 2000:
        return {"error": "句子过长或为空"}

    prompt = (
        f"Translate the following English sentence to Chinese:\n\n{sentence}\n\n"
        f"Output format:\n"
        f"【原文】{sentence}\n"
        f"【翻译】...\n"
        f"【解析】对句子结构和关键单词做简要说明。\n"
        f"只用中文回复。"
    )

    messages = [
        {"role": "system", "content": "你是专业的英汉翻译和英语学习助手。"},
        {"role": "user", "content": prompt}
    ]

    return call_ai_api(messages, config)


# ─── API 路由 ────────────────────────────────────────────────

@app.route('/')
def index():
    """返回主页面"""
    return send_from_directory('static', 'index.html')


@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    """获取或保存配置"""
    if request.method == 'GET':
        cfg = load_config()
        # 不返回完整 API key
        key = cfg.get("api_key", "")
        cfg["api_key_masked"] = key[:8] + "****" + key[-4:] if len(key) > 12 else ""
        cfg["api_key"] = ""  # 不暴露完整 key
        return jsonify({"success": True, "config": cfg})

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "无效的请求数据"}), 400

    cfg = load_config()
    if "api_key" in data and data["api_key"]:
        cfg["api_key"] = data["api_key"]
    if "api_base" in data and data["api_base"]:
        cfg["api_base"] = data["api_base"]
    if "model" in data and data["model"]:
        cfg["model"] = data["model"]
    if "provider" in data and data["provider"]:
        cfg["provider"] = data["provider"]
    save_config(cfg)
    return jsonify({"success": True})


@app.route('/api/books')
def api_list_books():
    """列出书籍"""
    books = list_books()
    return jsonify({"success": True, "books": books})


@app.route('/api/books/<path:filename>')
def api_get_book(filename):
    """加载并解析书籍"""
    filepath = os.path.join(BOOKS_DIR, filename)
    # 安全检查
    realpath = os.path.realpath(filepath)
    if not realpath.startswith(os.path.realpath(BOOKS_DIR)):
        return jsonify({"success": False, "error": "不允许的路径"}), 403

    if not os.path.exists(filepath):
        return jsonify({"success": False, "error": "文件未找到"}), 404

    ext = os.path.splitext(filename)[1].lower()

    parsers = {
        '.txt': parse_txt,
        '.epub': parse_epub,
        '.pdf': parse_pdf,
        '.docx': parse_docx,
        '.html': parse_html,
        '.htm': parse_html,
    }

    parser = parsers.get(ext)
    if not parser:
        return jsonify({"success": False, "error": f"暂不支持 {ext} 格式"}), 400

    try:
        book = parser(filepath)
        return jsonify({"success": True, "book": book})
    except Exception as e:
        return jsonify({"success": False, "error": f"解析失败: {str(e)}"}), 500


@app.route('/api/upload', methods=['POST'])
def api_upload_book():
    """上传书籍文件"""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "未选择文件"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "文件名为空"}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        return jsonify({
            "success": False,
            "error": f"不支持 {ext} 格式，支持: {', '.join(SUPPORTED_FORMATS.values())}"
        }), 400

    # 保存到 books 目录
    import time
    safe_name = file.filename
    save_path = os.path.join(BOOKS_DIR, safe_name)

    # 如果已存在，加时间戳
    if os.path.exists(save_path):
        base, ext2 = os.path.splitext(safe_name)
        safe_name = f"{base}_{int(time.time())}{ext2}"
        save_path = os.path.join(BOOKS_DIR, safe_name)

    file.save(save_path)
    size = os.path.getsize(save_path)

    return jsonify({
        "success": True,
        "book": {
            "name": os.path.splitext(safe_name)[0],
            "filename": safe_name,
            "ext": ext,
            "format_label": SUPPORTED_FORMATS.get(ext, '📄'),
            "size_str": format_size(size)
        }
    })


@app.route('/api/translate/word', methods=['POST'])
def api_translate_word():
    """翻译单词"""
    data = request.get_json()
    word = data.get("word", "").strip()
    mode = data.get("mode", "simple")  # simple or detailed

    if not word:
        return jsonify({"success": False, "error": "请输入单词"}), 400

    config = load_config()
    result = translate_word(word, mode, config)

    if "error" in result:
        return jsonify({"success": False, "error": result["error"]}), 500

    return jsonify({"success": True, "word": word, "mode": mode, "translation": result["content"]})


@app.route('/api/translate/sentence', methods=['POST'])
def api_translate_sentence():
    """翻译句子"""
    data = request.get_json()
    sentence = data.get("sentence", "").strip()

    if not sentence:
        return jsonify({"success": False, "error": "请输入句子"}), 400

    config = load_config()
    result = translate_sentence(sentence, config)

    if "error" in result:
        return jsonify({"success": False, "error": result["error"]}), 500

    return jsonify({"success": True, "sentence": sentence, "translation": result["content"]})


@app.route('/api/config/test', methods=['POST'])
def api_test_config():
    """测试 API 配置是否可用"""
    data = request.get_json()
    api_key = data.get("api_key", "")

    if not api_key:
        cfg = load_config()
        api_key = cfg.get("api_key", "")

    if not api_key:
        return jsonify({"success": False, "error": "未配置 API Key"})

    test_config = dict(load_config())
    test_config["api_key"] = api_key
    # 支持前端传入临时 base/model 测试（多厂商切换时）
    if data.get("api_base"):
        test_config["api_base"] = data["api_base"]
    if data.get("model"):
        test_config["model"] = data["model"]

    result = call_ai_api([
        {"role": "user", "content": "回复 OK 表示连接正常"}
    ], test_config)

    if "error" in result:
        return jsonify({"success": False, "error": result["error"]})

    return jsonify({"success": True, "message": result["content"]})


# ─── 启动（原生窗口模式，绝不打开浏览器） ─────────────────

def start_flask():
    """在子线程启动 Flask 服务"""
    os.makedirs(BOOKS_DIR, exist_ok=True)
    app.run(host='127.0.0.1', port=5980, debug=False, use_reloader=False)


if __name__ == '__main__':
    import threading
    import time

    # 1. 子线程启动 Flask
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()
    time.sleep(2)  # 等 Flask 就绪

    # 2. 创建原生窗口（像微信一样，无浏览器无控制台）
    try:
        import webview
        webview.create_window(
            title='务思语 - 英语沉浸阅读器',
            url='http://localhost:5980',
            width=1200, height=800,
            resizable=True, min_size=(800, 600),
            text_select=True,
        )
        webview.start()
    except Exception as e:
        print(f"原生窗口启动失败: {e}")
        # 绝不弹浏览器——明确提示用户
        try:
            input("务思语需要 Edge WebView2 支持原生窗口，启动失败。请按回车退出...")
        except:
            pass
    finally:
        os._exit(0)
