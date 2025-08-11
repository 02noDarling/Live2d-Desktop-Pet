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
import win32gui
import win32con

from api import *

# 如果win32gui没有MAKELONG，我们自己定义
if not hasattr(win32gui, 'MAKELONG'):
    def MAKELONG(low, high):
        return (high << 16) | (low & 0xFFFF)
    win32gui.MAKELONG = MAKELONG

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

def click_canvas_center():
    """
    点击Live2D画布正中间以触发唇形匹配
    使用Windows API直接发送点击消息，不移动鼠标
    """
    try:
        # 查找真正的应用程序窗口
        target_hwnd = None
        
        def find_electron_window(hwnd, windows):
            if win32gui.IsWindowVisible(hwnd):
                try:
                    window_text = win32gui.GetWindowText(hwnd)
                    class_name = win32gui.GetClassName(hwnd)
                    
                    # 排除系统窗口和代理窗口
                    if ('TabProxyWindow' in class_name or 
                        'Shell_TrayWnd' in class_name or 
                        'TaskListThumbnailWnd' in class_name):
                        return True
                    
                    # 查找Electron窗口（通常类名包含Chrome或Electron相关）
                    if ('Chrome' in class_name or 'Electron' in class_name or 
                        class_name == 'ApplicationFrameWindow' or
                        class_name.startswith('Chrome_WidgetWin')):
                        
                        # 检查窗口大小是否合理
                        rect = win32gui.GetWindowRect(hwnd)
                        width = rect[2] - rect[0]
                        height = rect[3] - rect[1]
                        
                        if width > 300 and height > 300:  # 确保是主窗口
                            print(f"找到候选窗口: 标题='{window_text}', 类名='{class_name}', 大小={width}x{height}, 句柄={hex(hwnd)}", file=sys.stderr)
                            
                            # 计算窗口优先级分数
                            priority_score = calculate_window_priority(window_text, width, height)
                            windows.append((hwnd, window_text, class_name, width * height, priority_score))
                            
                except Exception as e:
                    pass
            return True
        
        def calculate_window_priority(window_text, width, height):
            """
            计算窗口优先级分数，分数越高越优先
            """
            score = 0
            window_text_lower = window_text.lower()
            
            # 优先级1: 明确的Live2D相关应用程序
            if any(keyword in window_text_lower for keyword in [
                'typescript html app',  # 目标应用
                'live2d',
                'desktop pet',
                'electron app'
            ]):
                score += 1000
            
            # 优先级2: 排除明显不相关的应用
            if any(keyword in window_text_lower for keyword in [
                'visual studio code',
                'vscode', 
                'vs code',
                'chrome',
                'firefox',
                'edge',
                'notepad',
                'word',
                'excel',
                'powerpoint',
                'cmd',
                'powershell',
                'terminal'
            ]):
                score -= 500  # 大幅降低这些应用的优先级
            
            # 优先级3: 窗口大小合理性（不要太大也不要太小）
            area = width * height
            # 理想大小范围：800x600 到 1600x1200
            ideal_min = 800 * 600
            ideal_max = 1600 * 1200
            
            if ideal_min <= area <= ideal_max:
                score += 100  # 理想大小范围
            elif area < ideal_min:
                score += 50   # 较小窗口（可能是目标应用的小窗口模式）
            else:
                score -= 50   # 过大窗口（可能是IDE等）
            
            # 优先级4: 窗口标题简洁性（简单标题更可能是目标应用）
            if len(window_text) < 30:
                score += 20
            elif len(window_text) > 80:
                score -= 20
            
            return score
        
        # 枚举所有窗口
        candidate_windows = []
        win32gui.EnumWindows(find_electron_window, candidate_windows)
        
        if candidate_windows:
            # 按优先级分数排序，优先级高的在前
            candidate_windows.sort(key=lambda x: x[4], reverse=True)  # x[4] 是 priority_score
            
            print(f"窗口优先级排序结果:", file=sys.stderr)
            for i, (hwnd, title, class_name, area, score) in enumerate(candidate_windows[:3]):  # 只显示前3个
                print(f"  {i+1}. 分数={score}, 标题='{title}', 类名='{class_name}', 句柄={hex(hwnd)}", file=sys.stderr)
            
            target_hwnd = candidate_windows[0][0]
            selected_title = candidate_windows[0][1]
            selected_class = candidate_windows[0][2]
            selected_score = candidate_windows[0][4]
            
            print(f"选择窗口: 句柄={hex(target_hwnd)}, 标题='{selected_title}', 类名='{selected_class}', 分数={selected_score}", file=sys.stderr)
        else:
            print("未找到合适的Electron窗口", file=sys.stderr)
            return
        
        if target_hwnd:
            # 获取窗口的客户区大小（实际可用区域）
            try:
                # 获取窗口矩形
                window_rect = win32gui.GetWindowRect(target_hwnd)
                # 获取客户区矩形
                client_rect = win32gui.GetClientRect(target_hwnd)
                
                # 客户区大小
                client_width = client_rect[2] - client_rect[0]
                client_height = client_rect[3] - client_rect[1]
                
                print(f"窗口客户区大小: width={client_width}, height={client_height}", file=sys.stderr)
                
                # 验证客户区大小合理性
                if client_width <= 100 or client_height <= 100:
                    print(f"客户区大小异常: {client_width}x{client_height}，尝试使用窗口大小", file=sys.stderr)
                    # 使用窗口大小而不是客户区大小
                    window_width = window_rect[2] - window_rect[0]
                    window_height = window_rect[3] - window_rect[1]
                    
                    if window_width > 300 and window_height > 300:
                        client_width = window_width
                        client_height = window_height
                        print(f"使用窗口大小: {client_width}x{client_height}", file=sys.stderr)
                    else:
                        print(f"窗口大小也异常: {window_width}x{window_height}", file=sys.stderr)
                        return
                
                # 根据CSS布局计算Live2D容器的实际大小和位置
                # 从index.html可以看到：
                # - #live2d-container 占据 flex: 1，即窗口高度 - 325px（底部聊天区域）
                # - #bottom-container 固定高度 325px
                bottom_container_height = 325
                live2d_container_height = client_height - bottom_container_height
                
                # 确保Live2D容器高度不会为负数
                if live2d_container_height <= 0:
                    print(f"Live2D容器高度计算异常: {live2d_container_height}，使用客户区高度的60%", file=sys.stderr)
                    live2d_container_height = int(client_height * 0.6)
                
                # 计算Live2D容器的中心位置（相对于客户区）
                relative_x = client_width // 2
                relative_y = live2d_container_height // 2  # Live2D容器在窗口顶部
                
                print(f"Live2D容器计算大小: width={client_width}, height={live2d_container_height}", file=sys.stderr)
                print(f"准备发送点击消息到相对坐标: ({relative_x}, {relative_y})", file=sys.stderr)
                
                # 将窗口置于前台
                try:
                    win32gui.SetForegroundWindow(target_hwnd)
                    time.sleep(0.05)  # 短暂等待
                except Exception as e:
                    print(f"设置前台窗口失败: {e}", file=sys.stderr)
                
                # 使用Windows API直接发送鼠标消息
                lParam = win32gui.MAKELONG(relative_x, relative_y)
                
                # 发送鼠标按下和释放消息
                win32gui.PostMessage(target_hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lParam)
                time.sleep(0.01)
                win32gui.PostMessage(target_hwnd, win32con.WM_LBUTTONUP, 0, lParam)
                
                print(f"已发送点击消息到Live2D画布中心", file=sys.stderr)
                
            except Exception as e:
                print(f"获取窗口信息或发送消息时出错: {e}", file=sys.stderr)
        else:
            print("未找到目标窗口", file=sys.stderr)
            
    except Exception as e:
        print(f"点击画布时出错: {e}", file=sys.stderr)


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

def voice_change(prompt, MAX_RETRIES=3):
    PORT = 5001
    HOST = "http://localhost"
    CHAT_URL = f"{HOST}:{PORT}/generate"
    CHECK_INTERVAL = 5  # 每隔 5 秒尝试一次
    retries = 0
    
    while retries < MAX_RETRIES:
        try:
            # 构建请求数据，包含历史上下文
            request_data = {
                "prompt": prompt
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

def wav_time_copy(source, target, result):
    import wave
    import numpy as np

    def get_wav_duration(file_path):
        """仅获取 wav 文件的播放时长（秒）"""
        with wave.open(file_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / rate  # 返回秒数

    def match_audio_length_by_duration(target_duration_file, source_file, output_file):
        """
        根据 target_duration_file 的时长，调整 source_file 的长度
        - 只从 target_duration_file 读取时长
        - 完全保留 source_file 的音频参数（采样率、声道、位深）
        - 不依赖 ffmpeg
        """
        # 1. 从 a.wav 获取时长（秒）
        target_duration_sec = get_wav_duration(target_duration_file)
        print(f"目标时长: {target_duration_sec:.2f} 秒", file=sys.stderr)

        # 2. 读取 b.wav 的音频数据和参数
        with wave.open(source_file, 'rb') as wf:
            params = wf.getparams()
            frames = wf.readframes(wf.getnframes())
            sample_rate = wf.getframerate()
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()

            if sampwidth == 1:
                dtype = np.uint8
            elif sampwidth == 2:
                dtype = np.int16
            elif sampwidth == 4:
                dtype = np.int32
            else:
                raise ValueError(f"不支持的采样宽度: {sampwidth}")

            audio_data = np.frombuffer(frames, dtype=dtype)
            if n_channels > 1:
                audio_data = audio_data.reshape(-1, n_channels)

        source_duration_sec = len(audio_data) / sample_rate
        print(f"源音频时长: {source_duration_sec:.2f} 秒", file=sys.stderr)

        # 3. 计算目标总帧数
        target_frames = int(target_duration_sec * sample_rate)

        # 4. 调整长度
        source_frames = len(audio_data)
        if source_frames >= target_frames:
            result_data = audio_data[:target_frames]
        else:
            repeats = int(np.ceil(target_frames / source_frames))
            result_data = np.tile(audio_data, (repeats, 1)) if n_channels > 1 else np.tile(audio_data, repeats)
            result_data = result_data[:target_frames]

        # 5. 保存，使用 b.wav 的原始参数
        with wave.open(output_file, 'wb') as wf:
            wf.setnchannels(n_channels)
            wf.setsampwidth(sampwidth)
            wf.setframerate(sample_rate)
            wf.writeframes(result_data.tobytes())

        print(f"已保存匹配长度的音频到: {output_file}", file=sys.stderr)

    match_audio_length_by_duration(source, target, result)

def play_voice():
    # 在导入 pygame 前设置环境变量
    os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'

    import pygame
    import time

    # 播放音频
    sound_file = "dist/Resources/Haru/sounds/audio_chinese.wav"
    target = "dist/Resources/Haru/sounds/haru_Info_14.wav"
    result = "dist/Resources/Haru/sounds/audio.wav"
    wav_time_copy(sound_file, target, result)

    pygame.mixer.init()
    pygame.mixer.music.load(sound_file)
    pygame.mixer.music.play()

    while pygame.mixer.music.get_busy():
        time.sleep(0.1)

    print("播放完成", file=sys.stderr)

def safe_print_with_lip_sync(text, enable_voice=True):
    """
    安全的输出函数，处理编码问题，并同时触发唇形同步
    使用同步方式避免线程问题
    
    Args:
        text (str): 要输出的文本
        enable_voice (bool): 是否启用语音播放
    """
    try:
        # 确保文本是字符串
        if not isinstance(text, str):
            text = str(text)

        # 只有在启用语音时才调用语音相关函数
        if enable_voice:
            # voice_change(text)
            tts_api(text)

        # 先输出文本
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
        
        # 然后同步触发唇形同步和语音播放
        time.sleep(0.1)  # 短暂延迟确保输出完成
        click_canvas_center()
            
    except Exception as e:
        # 最后的备选方案
        print("你好！很高兴和你聊天～", flush=True)
        try:
            time.sleep(0.1)
            if enable_voice:
                click_canvas_center()
        except:
            pass

def safe_print(text):
    """
    保持原有的safe_print函数用于其他地方
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
        tuple: (message, history, enable_voice)
    """
    try:
        with open(input_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return (
                data.get('message', ''), 
                data.get('history', []), 
                data.get('enableVoice', True)  # 默认启用语音
            )
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        return '', [], True

def main():
    """主函数"""
    try:
        # 检查参数数量
        if len(sys.argv) < 2:
            safe_print_with_lip_sync("你好！很高兴和你聊天～")
            sys.exit(0)
        
        enable_voice = True  # 默认启用语音
        
        # 获取输入方式：直接参数 或 文件路径
        if len(sys.argv) == 2:
            # 检查第一个参数是否是文件路径
            first_arg = sys.argv[1]
            if first_arg.startswith('file:'):
                # 文件模式
                input_file_path = first_arg[5:]  # 移除 'file:' 前缀
                message, history, enable_voice = read_input_data(input_file_path)
                
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
        elif len(sys.argv) == 4:
            # 新版本：带语音控制的参数模式
            message = sys.argv[1]
            try:
                history_json = sys.argv[2]
                history = json.loads(history_json) if history_json else []
                enable_voice = sys.argv[3].lower() == 'true'
            except (json.JSONDecodeError, IndexError, ValueError):
                history = []
                enable_voice = True
        else:
            safe_print_with_lip_sync("你好！很高兴和你聊天～")
            sys.exit(0)
        
        if not message.strip():
            safe_print_with_lip_sync("你好！很高兴和你聊天～", enable_voice)
            sys.exit(0)
        
        # 优先使用推理服务，如果失败则使用本地处理
        try:
            # response = check_service(message, history)
            response = llm_api(message, history)
            if response == "服务启动超时，请检查服务日志。":
                # 服务不可用，使用本地处理
                response = process_chat_message(message, history)
        except Exception:
            # 服务调用失败，使用本地处理
            response = process_chat_message(message, history)
        
        # 使用带唇形同步的输出函数，传入语音控制参数
        safe_print_with_lip_sync(response, enable_voice)
        
        sys.exit(0)
        
    except Exception as e:
        # 出错时输出默认回复而不是错误信息
        print(f"Error in main: {e}", file=sys.stderr)
        safe_print_with_lip_sync("你好！很高兴和你聊天～")
        sys.exit(0)

if __name__ == "__main__":
    main()