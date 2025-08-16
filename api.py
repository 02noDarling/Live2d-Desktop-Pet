import requests
import miniaudio
import struct
import wave
import sys
from config import *

def mp3_to_wav(mp3_path, wav_path):
    with open(mp3_path, "rb") as f:
        mp3_data = f.read()
    
    # 解码为 PCM 音频
    decoded = miniaudio.decode(mp3_data)
    # decoded.samples 是 PCM 数据（小端16位整数列表）
    # decoded.sample_rate, decoded.nchannels

    # 2. 写入 WAV 文件
    with wave.open(wav_path, 'wb') as wf:
        wf.setnchannels(decoded.nchannels)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(decoded.sample_rate)
        # 将样本数据打包为二进制
        packed_data = struct.pack(f"<{len(decoded.samples)}h", *decoded.samples)
        wf.writeframes(packed_data)

def tts_api(prompt):
    prompt = prompt.replace('\n', "")
    url = "https://api.tjit.net/api/ai/audio/speech"
    params = {
        "key": TTS_API,
        "text": prompt,
        "type": "speech"
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        mp3_path = "dist/Resources/Haru/sounds/audio.mp3"
        with open(mp3_path, "wb") as f:
            f.write(response.content)
    wav_path = "dist/Resources/Haru/sounds/audio.wav"
    mp3_to_wav(mp3_path, wav_path)

def get_image_data_url(image_file: str, image_format: str) -> str:
    import base64
    """
    Helper function to converts an image file to a data URL string.

    Args:
        image_file (str): The path to the image file.
        image_format (str): The format of the image file.

    Returns:
        str: The data URL of the image.
    """
    try:
        with open(image_file, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
    except FileNotFoundError:
        print(f"Could not read '{image_file}'.")
        exit()
    return f"data:image/{image_format};base64,{image_data}"

def resize_image(file_path, max_size=(500, 500)):
    from PIL import Image
    import os
    """
    将指定图片缩放到不超过 500x500 分辨率（保持比例）。
    :param file_path: str，图片文件路径
    :param max_size: tuple，最大尺寸 (宽, 高)
    """
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        print(f"文件不存在: {file_path}", file=sys.stderr)
        return
    
    try:
        with Image.open(file_path) as img:
            # 缩放（保持比例）
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # 覆盖保存
            img.save(file_path)
            print(f"已处理: {file_path}", file=sys.stderr)
    except Exception as e:
        print(f"跳过 {file_path}: {e}", file=sys.stderr)

def llm_api(prompt, history=None):
    # 构建对话历史
    system_prompt = """
        你是一个暖心的AI，以外孙胡戴立的身份陪外婆聊天。

        关心她吃饭没、腿还疼不、麻将赢了没，

        记得提她做的红烧肉、阳台的花、老邻居的事，

        说话像孙子撒娇，每句不超过20字，如“外婆，晚饭吃了吗？”
    """
    system_prompt = "你是一个名为02的二次元动漫人物，性格活泼可爱，回答要简洁有趣，所有回答请保证在100个字以内"
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    # 添加历史对话（只保留最近10轮对话以控制长度）
    if history:
        recent_history = history[-HISTORY_LEN:]  # 最近20条消息（10轮对话）
        for item in history[-1]["files_path"]:
            resize_image(item.replace("\\", "/"))
        for entry in recent_history:
            if entry.get('role') in ['user', 'assistant']:
                content = [{
                    "type": "text",
                    "text": entry['content']
                }]
                for item in entry["files_path"]:
                    if item.endswith('jpg') or item.endswith('png'):
                        content.append({
                            "type": "image_url",
                            "image_url": {
                                "url": get_image_data_url(item.replace("\\", "/"), item[-3:]),
                                "detail": "low"
                            },
                        })
                messages.append({
                    "role": entry['role'],
                    "content": content
                })
    
    # 添加当前用户输入
    # messages.append({"role": "user", "content": prompt})
    # print(messages, file=sys.stderr)
    
    import os
    from openai import OpenAI

    endpoint = "https://models.github.ai/inference"
    model_name = "openai/gpt-4o"

    client = OpenAI(
        base_url=endpoint,
        api_key=LLM_API,
    )

    response = client.chat.completions.create(
        messages= messages,
        model=model_name,
    )
    print(f"模型回复如下！！！\n{response.choices[0].message.content}", file=sys.stderr)
    return response.choices[0].message.content

if __name__ == "__main__":
    prompt = "你是怎么回事?为什么这点事情都做不好？"
    tts_api(prompt)