from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

app = Flask(__name__)

# 模型路径
model_path = "./model/chat/Qwen2.5-0.5B-Instruct"

# 加载模型和 tokenizer
print("Loading model...")
tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(model_path, trust_remote_code=True)

# 强制使用 CPU
device = torch.device("cpu")
model.to(device)
print("Model loaded on CPU.")

# 推理函数
def generate_response(prompt, max_new_tokens=100):
    messages = [
        {"role": "system", "content": "你是一个有用的小助手，所有回答请保证在100个字以内"},
        {"role": "user", "content": prompt}
    ]
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    model_inputs = tokenizer([text], return_tensors="pt").to(model.device)
    generated_ids = model.generate(
        **model_inputs,
        max_new_tokens=512
    )
    generated_ids = [
        output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
    ]

    response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return response

# 定义 API 接口
@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    prompt = data.get("prompt", "你好")
    max_new_tokens = data.get("max_new_tokens", 100)

    response = generate_response(prompt, max_new_tokens)
    print(response)
    return jsonify({"response": response})

# 启动服务
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)