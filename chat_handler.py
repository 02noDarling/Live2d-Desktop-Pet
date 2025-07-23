#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
聊天消息处理器
目前返回固定回复，未来可以集成LLM
"""

import sys
import time
import random
import io
import os
import requests

# 设置输出编码为UTF-8
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def process_chat_message(message):
    """
    处理聊天消息
    
    Args:
        message (str): 用户输入的消息
        
    Returns:
        str: 回复消息
    """
    # 模拟处理时间
    time.sleep(random.uniform(0.5, 1.5))
    
    # 目前返回固定回复，未来这里可以调用LLM API
    responses = [
        "你好！很高兴和你聊天～",
        "我明白你的意思了！",
        "这听起来很有趣呢！",
        "让我想想...嗯，我觉得你说得对！",
        "哇，真的吗？告诉我更多吧！",
        "我也这么想！我们很有默契呢～"
    ]
    
    # 简单的关键词回复逻辑
    message_lower = message.lower()
    
    if any(word in message_lower for word in ['你好', 'hello', 'hi', '嗨']):
        return "你好！很高兴见到你！今天过得怎么样？"
    elif any(word in message_lower for word in ['谢谢', '感谢', 'thank']):
        return "不用客气！我很乐意帮助你～"
    elif any(word in message_lower for word in ['再见', 'bye', '拜拜']):
        return "再见！记得常来找我聊天哦～"
    elif '?' in message or '？' in message:
        return "这是个好问题！让我想想...我觉得这取决于具体情况呢。"
    else:
        return random.choice(responses)

# def llm_response(query):
#     from transformers import AutoModelForCausalLM, AutoTokenizer

#     model_path = "/Users/hudaili/Desktop/VsCodeProjects/Live2d-Desktop-Pet/model/chat/Qwen2.5-0.5B-Instruct"

#     model = AutoModelForCausalLM.from_pretrained(
#         model_path,
#         torch_dtype="auto"
#     )
#     tokenizer = AutoTokenizer.from_pretrained(model_path)

#     messages = [
#         {"role": "system", "content": "你是一个名为02的二次元动漫人物"},
#         {"role": "user", "content": query}
#     ]
#     text = tokenizer.apply_chat_template(
#         messages,
#         tokenize=False,
#         add_generation_prompt=True
#     )
#     model_inputs = tokenizer([text], return_tensors="pt").to(model.device)

#     generated_ids = model.generate(
#         **model_inputs,
#         max_new_tokens=512
#     )
#     generated_ids = [
#         output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
#     ]

#     response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
#     # print(response)
#     return response

def check_service(query, MAX_RETRIES=3):
    PORT = 5000
    HOST = "http://localhost"
    CHAT_URL = f"{HOST}:{PORT}/chat"
    CHECK_INTERVAL = 5  # 每隔 2 秒尝试一次
    retries = 0
    while retries < MAX_RETRIES:
        try:
            # 发送一个测试请求
            response = requests.post(CHAT_URL, json={"prompt": query}, timeout=15)
            if response.status_code == 200:
                result = response.json()
                return result["response"]
        except (requests.ConnectionError, requests.Timeout):
            retries += 1
            time.sleep(CHECK_INTERVAL)

    return "服务启动超时，请检查服务日志。"


def main():
    """主函数"""
    try:
        if len(sys.argv) != 2:
            print("你好！很高兴和你聊天～")
            sys.exit(0)
        
        message = sys.argv[1]
        if not message.strip():
            print("你好！很高兴和你聊天～")
            sys.exit(0)
            
        # response = process_chat_message(message)
        # response = llm_response(message)
        response = check_service(message)
        print(response, flush=True)
        sys.exit(0)
        
    except Exception as e:
        # 出错时输出默认回复而不是错误信息
        print("你好！很高兴和你聊天～", flush=True)
        sys.exit(0)

if __name__ == "__main__":
    main()