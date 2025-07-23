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
            
        response = process_chat_message(message)
        print(response, flush=True)
        sys.exit(0)
        
    except Exception as e:
        # 出错时输出默认回复而不是错误信息
        print("你好！很高兴和你聊天～", flush=True)
        sys.exit(0)

if __name__ == "__main__":
    main()