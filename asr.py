import sys
import json
import base64
import urllib
import requests
import os
from config import *

def main(audio_file):
    speech = get_file_content_as_base64(audio_file, False)
    file_len = os.path.getsize(audio_file)

    url = "https://vop.baidu.com/server_api"

    payload = json.dumps({
        "format": "wav",
        "rate": 16000,
        "channel": 1,
        "cuid": "123456PYTHON",
        "speech": speech,
        "len": file_len,
        "token": get_access_token(),
        "dev_pid": 1537
    }, ensure_ascii=False)

    headers = {'Content-Type': 'application/json'}

    response = requests.post(url, headers=headers, data=payload.encode("utf-8"))
    
    # 如果要调试，用 stderr 打印，这样 stdout 就干净
    res = json.loads(response.text)
    print(res["result"][0])


def get_file_content_as_base64(path, urlencoded=False):
    with open(path, "rb") as f:
        content = base64.b64encode(f.read()).decode("utf8")
        if urlencoded:
            content = urllib.parse.quote_plus(content)
    return content

def get_access_token():
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_ASR_API_KEY,
        "client_secret": BAIDU_ASR_SECRET_KEY
    }
    return str(requests.post(url, params=params).json().get("access_token"))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        AUDIO_FILE = sys.argv[1]
        main(AUDIO_FILE)
    # 不向 stdout 输出任何东西
    sys.exit(0)