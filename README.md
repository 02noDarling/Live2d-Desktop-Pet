# 项目启动指南

## 启动步骤

请按照以下步骤操作以启动本项目：

### 1. 创建虚拟环境

在项目的根目录下运行以下命令创建一个虚拟环境：

```bash
python -m venv .venv
```


### 2. 激活虚拟环境

- **Windows:**

  ```bash
  .\.venv\Scripts\activate
  ```

- **Unix或MacOS:**

  ```bash
  source .venv/bin/activate
  ```

### 3. 安装依赖包

确保虚拟环境激活后，运行以下命令安装Python依赖：

```bash
pip install -r requirements.txt
```

### 4. 清理npm缓存（如果有缓存问题）

如果遇到缓存相关的问题，可以尝试清理npm缓存：

```bash
npm cache clean --force
```

### 5. 安装Node.js依赖

接着，安装Node.js以及相关的依赖包：

```bash
npm install
```
或者
```bash
// 全局安装cnpm (mac需要加上sudo)
npm install cnpm -g --registry=https://registry.npmmirror.com
 
// 成功后使用cnpm install安装
cnpm install
```

### 6. 启动应用

最后，运行以下命令启动应用：

```bash
// Windows系统运行
cscript live2d.vbs

// 其余系统 
npm start
```

## 模型放置

### 目录结构

将模型放置于项目根目录下的`model_infer`文件夹中。例如，对于聊天模型和文本到语音转换(TTS)模型，你的目录结构应该看起来像这样：

```plaintext
Live2d-Desktop-Pet/
├── model_infer/
│   ├── chat/
│   │   └── Qwen2.5-0.5B-Instruct/
│   │       ├── LICENSE
│   │       ├── README.md
│   │       ├── config.json
│   │       ├── generation_config.json
│   │       ├── gitattributes
│   │       ├── merges.txt
│   │       ├── model.safetensors
│   │       ├── tokenizer.json
│   │       ├── tokenizer_config.json
│   │       └── vocab.json
│   └── tts/
│       └── [TTS模型的相关文件]
│
├── main.js
├── package.json
├── requirements.txt
├── chat_handler.py
├── inference_service.py
└── 其他资源文件（如dist/、.venv/等）
```

请确保遵循上述结构放置您的模型文件。