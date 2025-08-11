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
        for entry in recent_history:
            if entry.get('role') in ['user', 'assistant']:
                messages.append({
                    "role": entry['role'],
                    "content": entry['content']
                })
    
    # 添加当前用户输入
    messages.append({"role": "user", "content": prompt})
    
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