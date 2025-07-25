#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
聊天消息处理器
支持上下文历史的对话处理
"""

import sys
import time
import random
import io
import os
import requests
import json
import tempfile
import locale

# Windows编码问题修复
if sys.platform == 'win32':
    # 设置控制台编码为UTF-8
    try:
        os.system('chcp 65001 > nul')
    except:
        pass
    
    # 强制设置标准输出编码
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    else:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    
    # 设置环境变量
    os.environ['PYTHONIOENCODING'] = 'utf-8'

def process_chat_message(message, history=None):
    """
    处理聊天消息
    
    Args:
        message (str): 用户输入的消息
        history (list): 对话历史记录
        
    Returns:
        str: 回复消息
    """
    # 模拟处理时间
    time.sleep(random.uniform(0.5, 1.5))
    
    # 简单的关键词回复逻辑，考虑历史上下文
    message_lower = message.lower()
    
    # 分析历史对话获取上下文
    context_info = analyze_history(history) if history else {}
    
    if any(word in message_lower for word in ['你好', 'hello', 'hi', '嗨']):
        if context_info.get('greeting_count', 0) > 0:
            return "又见面了！今天想聊什么呢？"
        else:
            return "你好！很高兴见到你！今天过得怎么样？"
    elif any(word in message_lower for word in ['谢谢', '感谢', 'thank']):
        return "不用客气！我很乐意帮助你～"
    elif any(word in message_lower for word in ['再见', 'bye', '拜拜']):
        return "再见！记得常来找我聊天哦～"
    elif '?' in message or '？' in message:
        return "这是个好问题！让我想想...我觉得这取决于具体情况呢。"
    else:
        # 根据历史对话选择更合适的回复
        responses = [
            "我明白你的意思了！",
            "这听起来很有趣呢！",
            "让我想想...嗯，我觉得你说得对！",
            "哇，真的吗？告诉我更多吧！",
            "我也这么想！我们很有默契呢～"
        ]
        
        # 如果历史对话中有相关话题，给出更相关的回复
        if context_info.get('topics'):
            topic_responses = {
                'weather': "天气确实是个有趣的话题呢！",
                'food': "说到吃的，我虽然不能品尝，但听起来就很棒！",
                'work': "工作的事情有时候确实不容易，加油！",
                'study': "学习新知识总是令人兴奋的！"
            }
            for topic in context_info['topics']:
                if topic in topic_responses:
                    return topic_responses[topic]
        
        return random.choice(responses)

def analyze_history(history):
    """
    分析对话历史，提取上下文信息
    
    Args:
        history (list): 对话历史记录
        
    Returns:
        dict: 上下文信息
    """
    if not history:
        return {}
    
    info = {
        'greeting_count': 0,
        'topics': set(),
        'recent_messages': []
    }
    
    for entry in history:
        if entry.get('role') == 'user':
            content = entry.get('content', '').lower()
            info['recent_messages'].append(content)
            
            # 统计问候次数
            if any(word in content for word in ['你好', 'hello', 'hi', '嗨']):
                info['greeting_count'] += 1
            
            # 识别话题
            if any(word in content for word in ['天气', '温度', '下雨', '晴天']):
                info['topics'].add('weather')
            if any(word in content for word in ['吃', '饭', '食物', '美食']):
                info['topics'].add('food')
            if any(word in content for word in ['工作', '上班', '公司', '同事']):
                info['topics'].add('work')
            if any(word in content for word in ['学习', '学校', '考试', '书']):
                info['topics'].add('study')
    
    # 只保留最近5条消息
    info['recent_messages'] = info['recent_messages'][-5:]
    
    return info

def check_service(query, history=None, MAX_RETRIES=3):
    """
    检查并调用推理服务
    
    Args:
        query (str): 用户查询
        history (list): 对话历史
        MAX_RETRIES (int): 最大重试次数
        
    Returns:
        str: 响应内容
    """
    PORT = 5000
    HOST = "http://localhost"
    CHAT_URL = f"{HOST}:{PORT}/chat"
    CHECK_INTERVAL = 5  # 每隔 5 秒尝试一次
    retries = 0
    
    while retries < MAX_RETRIES:
        try:
            # 构建请求数据，包含历史上下文
            request_data = {
                "prompt": query,
                "history": history or []
            }
            
            # 发送请求
            response = requests.post(CHAT_URL, json=request_data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                return result["response"]
        except (requests.ConnectionError, requests.Timeout):
            retries += 1
            time.sleep(CHECK_INTERVAL)

    return "服务启动超时，请检查服务日志。"

def safe_print(text):
    """
    安全的输出函数，处理编码问题
    """
    try:
        # 确保文本是字符串
        if not isinstance(text, str):
            text = str(text)
        
        # 在Windows上，确保正确编码
        if sys.platform == 'win32':
            # 尝试多种编码方式
            try:
                print(text, flush=True)
            except UnicodeEncodeError:
                # 如果UTF-8失败，尝试替换不可编码字符
                safe_text = text.encode('utf-8', errors='replace').decode('utf-8')
                print(safe_text, flush=True)
        else:
            print(text, flush=True)
    except Exception as e:
        # 最后的备选方案
        print("你好！很高兴和你聊天～", flush=True)

def read_input_data(input_file_path):
    """
    从文件读取输入数据
    
    Args:
        input_file_path (str): 输入文件路径
        
    Returns:
        tuple: (message, history)
    """
    try:
        with open(input_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('message', ''), data.get('history', [])
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        return '', []

def main():
    """主函数"""
    try:
        # 检查参数数量
        if len(sys.argv) < 2:
            safe_print("你好！很高兴和你聊天～")
            sys.exit(0)
        
        # 获取输入方式：直接参数 或 文件路径
        if len(sys.argv) == 2:
            # 检查第一个参数是否是文件路径
            first_arg = sys.argv[1]
            if first_arg.startswith('file:'):
                # 文件模式
                input_file_path = first_arg[5:]  # 移除 'file:' 前缀
                message, history = read_input_data(input_file_path)
                
                # 清理临时文件
                try:
                    os.remove(input_file_path)
                except:
                    pass
            else:
                # 直接参数模式（兼容旧版本）
                message = first_arg
                history = []
        elif len(sys.argv) == 3:
            # 兼容旧版本：直接参数模式
            message = sys.argv[1]
            try:
                history_json = sys.argv[2]
                history = json.loads(history_json) if history_json else []
            except (json.JSONDecodeError, IndexError):
                history = []
        else:
            safe_print("你好！很高兴和你聊天～")
            sys.exit(0)
        
        if not message.strip():
            safe_print("你好！很高兴和你聊天～")
            sys.exit(0)
        
        # 优先使用推理服务，如果失败则使用本地处理
        try:
            response = check_service(message, history)
            if response == "服务启动超时，请检查服务日志。":
                # 服务不可用，使用本地处理
                response = process_chat_message(message, history)
        except Exception:
            # 服务调用失败，使用本地处理
            response = process_chat_message(message, history)
        
        safe_print(response)
        sys.exit(0)
        
    except Exception as e:
        # 出错时输出默认回复而不是错误信息
        print(f"Error in main: {e}", file=sys.stderr)
        safe_print("你好！很高兴和你聊天～")
        sys.exit(0)

if __name__ == "__main__":
    main()