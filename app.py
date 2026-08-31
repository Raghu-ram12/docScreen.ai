import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

from main import app

try:
    import gradio as gr
    with gr.Blocks(title="docScreen.ai - Document Screening API") as demo:
        gr.Markdown("# 🛂 docScreen.ai Document Screening System\n\nAI-Powered Identity Document Verification and Fraud Detection\n\n- **API Documentation**: `/docs` (Swagger UI)\n- **Health Check**: `/health`\n- **Screening Endpoint**: `POST /analyze-document`")
    app = gr.mount_gradio_app(app, demo, path="/")
except ImportError:
    pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
