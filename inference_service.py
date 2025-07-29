from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

app = Flask(__name__)

# 模型路径
model_path = "./model_infer/chat/Qwen2.5-0.5B-Instruct"

# 加载模型和 tokenizer
print("Loading model...")
tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(model_path, trust_remote_code=True)

# 强制使用 CPU
device = torch.device("cpu")
model.to(device)
print("Model loaded on CPU.")

# 推理函数
def generate_response(prompt, history=None, max_new_tokens=100):
    """
    生成回复，支持上下文历史
    
    Args:
        prompt (str): 用户输入
        history (list): 对话历史
        max_new_tokens (int): 最大生成token数
        
    Returns:
        str: 生成的回复
    """
    # 构建对话历史
    messages = [
        {"role": "system", "content": "你是一个名为02的二次元动漫人物，性格活泼可爱，回答要简洁有趣，所有回答请保证在100个字以内"}
    ]
    
    # 添加历史对话（只保留最近10轮对话以控制长度）
    if history:
        recent_history = history[-20:]  # 最近20条消息（10轮对话）
        for entry in recent_history:
            if entry.get('role') in ['user', 'assistant']:
                messages.append({
                    "role": entry['role'],
                    "content": entry['content']
                })
    
    # 添加当前用户输入
    messages.append({"role": "user", "content": prompt})
    
    try:
        # 应用聊天模板
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        # 编码输入
        model_inputs = tokenizer([text], return_tensors="pt").to(model.device)
        
        # 生成回复
        generated_ids = model.generate(
            **model_inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id
        )
        
        # 解码生成的内容（只取新生成的部分）
        generated_ids = [
            output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]
        
        response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        # 清理回复内容
        response = response.strip()
        if not response:
            response = "我明白你的意思了！"
        
        return response
        
    except Exception as e:
        print(f"Error generating response: {e}")
        return "抱歉，我现在有点困惑，能再说一遍吗？"

# 定义 API 接口
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        prompt = data.get("prompt", "你好")
        history = data.get("history", [])
        max_new_tokens = data.get("max_new_tokens", 100)

        response = generate_response(prompt, history, max_new_tokens)
        print(f"Generated response: {response}")
        
        return jsonify({"response": response})
        
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({"response": "抱歉，出现了一些问题，请稍后再试。"}), 500

# 健康检查接口
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "model": "Qwen2.5-0.5B-Instruct"})

# 启动服务
if __name__ == "__main__":
    print("Starting inference service...")
    app.run(host="0.0.0.0", port=5000, debug=False)