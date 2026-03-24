const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');

const proc = spawn('python3', ['-m', 'uvicorn', 'main:app', '--loop', 'asyncio', '--http', 'h11', '--port', '8000'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
});

proc.on('error', (err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});

proc.on('exit', (code) => process.exit(code ?? 0));
