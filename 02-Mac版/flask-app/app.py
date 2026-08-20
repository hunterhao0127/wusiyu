"""
务思语 - 英语沉浸式阅读器
Flask 后端: 书籍解析 + AI 翻译 (DeepSeek API)
"""

import os
import re
import json
import sys
import base64
import mimetypes
import posixpath
import requests
from flask import Flask, request, jsonify, send_from_directory

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
# 书籍和配置存在用户数据目录；打包后 app bundle 资源目录可能不可写。
APP_DIR = os.environ.get('WUSIYU_DATA_DIR') or base_path()
BOOKS_DIR = os.path.join(APP_DIR, 'books')
CONFIG_FILE = os.path.join(APP_DIR, 'config.json')
VERSION_FILE = os.path.join(APP_DIR, '务思语_version.txt')
APP_VERSION = "1.5.5"

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

SENTENCE_END_RE = re.compile(r'(?<=[.!?。！？])\s+')


def image_data_uri(data, mime=None):
    """把书内图片转成 data URI，保留图片位置且不需要额外静态文件。"""
    mime = mime or 'image/png'
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def clean_text(text):
    """清理无意义缩进/控制字符，保留中英文标点。"""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('\ufeff', '').replace('\u00a0', ' ')
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    lines = []
    for line in text.split('\n'):
        line = re.sub(r'^[\s\u3000¡﹛]+', '', line)
        line = re.sub(r'\s+', ' ', line).strip()
        lines.append(line)
    return '\n'.join(lines).strip()


def decode_text_file(filepath):
    """自动识别 UTF-8 / GBK / ANSI 类文本，避免符号显示成 ����。"""
    data = open(filepath, 'rb').read()
    best = None
    for enc in ['utf-8-sig', 'utf-8', 'gb18030', 'gbk', 'cp1252', 'latin-1']:
        try:
            text = data.decode(enc)
        except UnicodeDecodeError:
            text = data.decode(enc, errors='replace')
        score = text.count('\ufffd') * 1000 + text.count('\x00') * 100
        score += len(re.findall(r'(^|\n)[¡﹛]{2,}', text)) * 20
        score += text.count('Ã') + text.count('Â')
        if best is None or score < best[0]:
            best = (score, enc, text)
    return clean_text(best[2])


def is_chapter_title(text):
    text = clean_text(text)
    if not text or len(text) > 90:
        return False
    return bool(
        re.match(r'^(Chapter|Unit|Lesson|Part|Section|Module|Week)\b', text, re.IGNORECASE) or
        re.match(r'^(Interlude|Prologue|Epilogue|Appendix|Preface|Introduction)\b', text, re.IGNORECASE) or
        re.match(r'^(插曲|间奏|幕间|番外|序章|终章|附录|前言|引言)', text) or
        re.match(r'^\d+[\.\s]', text) or
        (text.isupper() and 3 < len(text) < 80)
    )


def split_long_text(text, limit=900):
    """把超长段按句子切短，避免一整页只有一个内部滚动段。"""
    text = clean_text(text)
    if not text:
        return []
    if len(text) <= limit:
        return [text]
    chunks = []
    buf = ''
    for part in SENTENCE_END_RE.split(text):
        part = part.strip()
        if not part:
            continue
        if buf and len(buf) + len(part) + 1 > limit:
            chunks.append(buf)
            buf = part
        else:
            buf = f"{buf} {part}".strip()
    if buf:
        chunks.append(buf)
    return chunks or [text]


def block_from_text(text, block_type=None):
    text = clean_text(text)
    if not text:
        return []
    kind = block_type or ('heading' if is_chapter_title(text) else 'paragraph')
    return [{"type": kind, "text": part} for part in split_long_text(text)]


def text_blocks_to_paragraphs(blocks):
    return [b["text"] for b in blocks if b.get("type") in ("paragraph", "heading") and b.get("text")]


def finalize_book(title, blocks):
    paragraphs = text_blocks_to_paragraphs(blocks)
    return {
        "title": title,
        "blocks": blocks,
        "paragraphs": paragraphs,
        "chapters": detect_chapters(paragraphs),
        "total": len(paragraphs)
    }

def parse_txt(filepath):
    """解析 TXT 文件，自动识别编码；无空行时按行分段。"""
    text = decode_text_file(filepath)
    raw_parts = re.split(r'\n\s*\n', text) if re.search(r'\n\s*\n', text) else text.split('\n')
    blocks = []
    for part in raw_parts:
        blocks.extend(block_from_text(part))
    return finalize_book(os.path.splitext(os.path.basename(filepath))[0], blocks)


def parse_epub(filepath):
    """解析 EPUB 文件"""
    from ebooklib import epub
    book = epub.read_epub(filepath)
    from ebooklib import ITEM_DOCUMENT, ITEM_IMAGE
    from bs4 import BeautifulSoup

    blocks = []
    images = {}
    title = book.get_metadata('DC', 'title')
    title = title[0][0].strip() if title and title[0] and title[0][0] else os.path.splitext(os.path.basename(filepath))[0]

    for item in book.get_items():
        if item.get_type() == ITEM_IMAGE:
            images[item.file_name] = image_data_uri(item.get_content(), item.media_type)

    for item in book.get_items():
        if item.get_type() == ITEM_DOCUMENT:
            content = item.get_body_content().decode('utf-8', errors='replace')
            soup = BeautifulSoup(content, 'lxml')
            for tag in soup(['script', 'style']):
                tag.decompose()
            for node in soup.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'li', 'img']):
                if node.name == 'img':
                    src = (node.get('src') or '').split('#')[0]
                    key = posixpath.normpath(posixpath.join(posixpath.dirname(item.file_name), src))
                    if key in images:
                        blocks.append({"type": "image", "src": images[key], "alt": node.get('alt') or ""})
                    continue
                text = clean_text(node.get_text(' ', strip=True))
                min_len = 2 if node.name.startswith('h') else 8
                if text and len(text) >= min_len:
                    blocks.extend(block_from_text(text, 'heading' if node.name.startswith('h') else None))

    if not text_blocks_to_paragraphs(blocks):
        for item in book.get_items():
            if item.get_type() == ITEM_DOCUMENT:
                content = item.get_body_content().decode('utf-8', errors='replace')
                soup = BeautifulSoup(content, 'lxml')
                text = soup.get_text(separator=' ', strip=True)
                sentences = re.split(r'(?<=[.!?])\s+', text)
                for s in sentences:
                    if clean_text(s) and len(clean_text(s)) > 15:
                        blocks.extend(block_from_text(s))

    return finalize_book(title, blocks)


def parse_pdf(filepath):
    """解析 PDF 文件"""
    import fitz  # PyMuPDF
    doc = fitz.open(filepath)

    blocks_out = []
    metadata_title = (doc.metadata or {}).get('title', '').strip()
    title = metadata_title or os.path.splitext(os.path.basename(filepath))[0]

    for page_num in range(doc.page_count):
        page = doc[page_num]
        blocks_out.append({"type": "heading", "text": f"第 {page_num + 1} 页"})
        for block in page.get_text("dict", sort=True).get("blocks", []):
            if block.get("type") == 1 and block.get("image"):
                ext = block.get("ext") or "png"
                mime = mimetypes.types_map.get(f".{ext.lower()}", "image/png")
                blocks_out.append({"type": "image", "src": image_data_uri(block["image"], mime), "alt": f"Page {page_num + 1} image"})
                continue
            if block.get("type") != 0:
                continue
            lines = []
            for line in block.get("lines", []):
                line_text = ''.join(span.get("text", "") for span in line.get("spans", []))
                if clean_text(line_text):
                    lines.append(clean_text(line_text))
            text = clean_text(' '.join(lines))
            if text and len(text) > 8:
                blocks_out.extend(block_from_text(text))

    doc.close()
    return finalize_book(title, blocks_out)


def parse_docx(filepath):
    """解析 DOCX 文件"""
    from docx import Document
    doc = Document(filepath)

    blocks = []
    ns = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    }
    for p in doc.paragraphs:
        text = clean_text(p.text)
        if text and len(text) > 5:
            blocks.extend(block_from_text(text))
        for blip in p._element.findall('.//a:blip', ns):
            rid = blip.get(f'{{{ns["r"]}}}embed')
            if rid and rid in doc.part.related_parts:
                part = doc.part.related_parts[rid]
                blocks.append({"type": "image", "src": image_data_uri(part.blob, part.content_type), "alt": ""})

    title = os.path.splitext(os.path.basename(filepath))[0]
    return finalize_book(title, blocks)


def parse_html(filepath):
    """解析 HTML/HTM 文件"""
    content = decode_text_file(filepath)

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'lxml')

    # 删除 script/style
    for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
        tag.decompose()

    blocks = []
    base_dir = os.path.dirname(os.path.realpath(filepath))
    for node in soup.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'li', 'img']):
        if node.name == 'img':
            src = node.get('src') or ''
            if src.startswith('data:') or src.startswith('http://') or src.startswith('https://'):
                blocks.append({"type": "image", "src": src, "alt": node.get('alt') or ""})
                continue
            img_path = os.path.realpath(os.path.join(base_dir, src))
            if img_path.startswith(base_dir + os.sep) and os.path.exists(img_path):
                mime = mimetypes.guess_type(img_path)[0] or 'image/png'
                with open(img_path, 'rb') as f:
                    blocks.append({"type": "image", "src": image_data_uri(f.read(), mime), "alt": node.get('alt') or ""})
            continue
        text = clean_text(node.get_text(' ', strip=True))
        if text and len(text) > (2 if node.name.startswith('h') else 8):
            blocks.extend(block_from_text(text, 'heading' if node.name.startswith('h') else None))

    title = os.path.splitext(os.path.basename(filepath))[0]
    return finalize_book(title, blocks)


def detect_chapters(paragraphs):
    """从段落中检测章节标题"""
    chapters = []
    current_chapter = {"title": "开头", "start": 0}
    for i, p in enumerate(paragraphs):
        if is_chapter_title(p):
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
    books = []
    if not os.path.isdir(BOOKS_DIR):
        return books
    for filename in os.listdir(BOOKS_DIR):
        f = os.path.join(BOOKS_DIR, filename)
        ext = os.path.splitext(filename)[1].lower()
        if not os.path.isfile(f) or ext not in SUPPORTED_FORMATS:
            continue
        name = os.path.splitext(filename)[0]
        size = os.path.getsize(f)
        books.append({
            "name": name,
            "filename": filename,
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

    word = word.strip().strip(",.!?;:\"'“”‘’()[]{}<>，。！？；：（）【】《》").strip()
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

    safe_name = os.path.basename(file.filename.replace('\\', '/'))
    if not safe_name:
        return jsonify({"success": False, "error": "文件名为空"}), 400

    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        return jsonify({
            "success": False,
            "error": f"不支持 {ext} 格式，支持: {', '.join(SUPPORTED_FORMATS.values())}"
        }), 400

    # 保存到 books 目录
    import time
    save_path = os.path.join(BOOKS_DIR, safe_name)
    real_books_dir = os.path.realpath(BOOKS_DIR)
    if not os.path.realpath(save_path).startswith(real_books_dir + os.sep):
        return jsonify({"success": False, "error": "不允许的路径"}), 403

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
    if os.environ.get('WUSIYU_ELECTRON') == '1':
        start_flask()
        raise SystemExit(0)

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
