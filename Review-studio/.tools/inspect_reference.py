from pathlib import Path
import re
import sys
import urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent / 'python'))
from pypdf import PdfReader
for name in ('0606_s26_qp_11.pdf', '0606_s26_ms_11.pdf'):
    reader = PdfReader(Path('C:/Users/EricGuo/Desktop') / name)
    print('\nREFERENCE:', name, 'pages:', len(reader.pages))
    for i, p in enumerate(reader.pages):
        if i < 3 or name.endswith('ms_11.pdf') and i < 5:
            print('PAGE', i + 1, (p.extract_text() or '')[:7000])
for path in ('quick_start/pricing', 'api/create-chat-completion'):
    s = urllib.request.urlopen('https://api-docs.deepseek.com/' + path, timeout=20).read().decode()
    plain = re.sub('<[^>]+>', ' ', s)
    for term in ('Input', 'image_url', 'vision', 'text-only', 'Text Only'):
        pos = plain.lower().find(term.lower())
        if pos >= 0:
            print(path, term, plain[max(0,pos-150):pos+500])
    print('image_url supported in schema:', 'image_url' in s)
