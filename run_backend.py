import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import uvicorn

uvicorn.run("main:app", host="127.0.0.1", port=8000, loop="asyncio")
