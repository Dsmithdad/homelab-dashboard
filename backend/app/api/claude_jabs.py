"""
Finds the most recent playful jabs between the user and the assistant in saved Claude Code chats.

Transcripts are JSON-lines files under ~/.claude/projects/<project>/<session>.jsonl. Only text the user typed
and text the assistant wrote is looked at (tool output, thinking and injected system text are skipped), and
each message yields at most one short sentence that contains a teasing cue. The matching is deliberately
loose: a little noise is fine, it's for fun.

Nothing is written to disk. Results are kept in memory per file and a file is only re-read when it changes.
Sentences that look like they could hold a secret are dropped, and long token-like strings are masked.

Setting (environment variable): CLAUDE_PROJECTS_DIR (default ~/.claude/projects).
"""
import glob
import json
import os
import re

PROJECTS_DIR = os.environ.get("CLAUDE_PROJECTS_DIR", os.path.expanduser("~/.claude/projects"))

_EMOJI = "😏😆😂🤣🙈😜😝😅😄🎣😭😬😎🫡💀"
_CUES_USER = re.compile(
    rf"[{_EMOJI}]|\blol\b|\bhaha+|\bslowpoke|\bpoking|\btiny stick|\bbusted|\bgotcha|\bnice try|\bbite\b|\broast|"
    r"\bclown|\bdork|\bnerd|\bno faith|\bwho'?s the|\bhow dare|\bsmh\b|\bskeet(?:er)?\b.{0,40}\b(?:wrong|fault|blame|lied)|"
    r"\bi win\b|\bwe'?re even\b|\bpoint to me\b|\b(?:want|give) that .{0,6}back\b",
    re.IGNORECASE)
_CUES_ASSISTANT = re.compile(
    rf"[{_EMOJI}]|\bslowpoke|\brival|\bbusted|\broast|\bnice try|\bpoint to you|\bround to you|\bgotcha|\bI bit\b|"
    r"\bdignity|\bvictory lap|\bkeep up|\bthick-skinned|\bsweat|\bfibbing|\bconfess|\breceipts|\bskipped|\bscroll",
    re.IGNORECASE)
# An emoji alone isn't a jab for the assistant (it puts them on everything): it also needs a teasing word or to be aimed at "you".
_ASSISTANT_NEEDS = re.compile(
    r"\bslowpoke|\brival|\bbusted|\broast|\bnice try|\bpoint to you|\bround to you|\bgotcha|\bI bit\b|\bdignity|\bvictory lap|"
    r"\bkeep up|\bthick-skinned|\bsweat|\bfibbing|\bconfess|\breceipts|\byou\b|\byour\b|\byou're\b",
    re.IGNORECASE)
_SECRETISH = re.compile(r"password|passwd|secret|token|api[_ -]?key|authkey|bearer|private key|ssh-|BEGIN [A-Z ]+KEY", re.IGNORECASE)
_LONG_TOKEN = re.compile(r"\b[A-Za-z0-9_\-]{28,}\b")
_CODEISH = re.compile(r"`|https?://|[/\\]\w+[/\\]|\{|\}|=>|^\s*[-*]?\s*\w+\(|─|★|\|")
_SENTENCES = re.compile(r"(?<=[.!?])\s+|\n+")

_cache = {}  # file path -> ((size, mtime_ns), [jab, ...])


def _text_parts(entry):
    """The human-written text blocks of one transcript record, or []."""
    kind = entry.get("type")
    if kind not in ("user", "assistant") or entry.get("isSidechain") or entry.get("isMeta"):
        return []
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        parts = [content]
    elif isinstance(content, list):
        parts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
    else:
        return []
    # Injected context (system reminders, browser instructions, slash-command wrappers) starts with a tag.
    return [p for p in parts if p and not p.lstrip().startswith("<")]


def _best_sentence(text, cue, needs=None, min_len=12):
    best, best_score = None, 0
    # Short one-liners ("i win", "what? no faith?") get chopped into fragments by the sentence splitter, so a
    # one-line message is also tried whole; it goes first so it wins ties.
    whole = text.strip()
    candidates = ([whole] if "\n" not in whole else []) + _SENTENCES.split(text)
    for raw in candidates:
        s = re.sub(r"[*_#>]+", "", raw).strip(" -\t")
        if not min_len <= len(s) <= 220 or _CODEISH.search(s) or _SECRETISH.search(s):
            continue
        if needs and not needs.search(s):
            continue
        score = len(cue.findall(s))
        if score > best_score:
            best, best_score = s, score
    return _LONG_TOKEN.sub("•••", best) if best else None


def _scan_file(path):
    jabs = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                if '"type":"user"' not in line.replace('": "', '":"') and '"type":"assistant"' not in line.replace('": "', '":"'):
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                parts = _text_parts(entry)
                if not parts:
                    continue
                who = "you" if entry["type"] == "user" else "skeeter"
                cue = _CUES_USER if who == "you" else _CUES_ASSISTANT
                sentence = _best_sentence("\n".join(parts), cue, _ASSISTANT_NEEDS if who == "skeeter" else None,
                                          min_len=4 if who == "you" else 12)
                if sentence and entry.get("timestamp"):
                    jabs.append({"who": who, "text": sentence, "timestamp": entry["timestamp"]})
    except OSError:
        return []
    return jabs


def recent_jabs(limit=5):
    found = []
    seen_paths = set()
    for path in glob.glob(os.path.join(PROJECTS_DIR, "*", "*.jsonl")):
        seen_paths.add(path)
        try:
            st = os.stat(path)
        except OSError:
            continue
        sig = (st.st_size, st.st_mtime_ns)
        hit = _cache.get(path)
        if not hit or hit[0] != sig:
            hit = (sig, _scan_file(path))
            _cache[path] = hit
        found.extend(hit[1])
    for gone in set(_cache) - seen_paths:
        del _cache[gone]

    found.sort(key=lambda j: j["timestamp"], reverse=True)
    out, texts = [], set()
    for j in found:
        if j["text"] in texts:
            continue
        texts.add(j["text"])
        out.append(j)
        if len(out) >= limit:
            break
    return out
