# Miner Commit - ada-detection

This is a miner commit API example for ada-detection.

## ✨ Features

- Miner commit
- Health check endpoint
- FastAPI
- Web service

---

## 🛠 Installation

### 1. 🚧 Prerequisites

- Install **Python (>= v3.10)** and **pip (>= 23)**:
    - **[RECOMMENDED] [Miniconda (v3)](https://www.anaconda.com/docs/getting-started/miniconda/install)**
    - _[arm64/aarch64] [Miniforge (v3)](https://github.com/conda-forge/miniforge)_
    - _[Python virtual environment] [venv](https://docs.python.org/3/library/venv.html)_

[OPTIONAL] For **DEVELOPMENT** environment:

- Install [**git**](https://git-scm.com/downloads)
- Setup an [**SSH key**](https://docs.github.com/en/github/authenticating-to-github/connecting-to-github-with-ssh)

### 2. 📦 Install dependencies

```sh
pip install -r ./requirements.txt
```

### JavaScript submission validation

Before every submission, validate every detector in `src/commit` against the
provided `eslint.config.mjs` configuration. Install the JavaScript validation
dependencies once, then run:

```sh
npm install
npx eslint --config ./eslint.config.mjs ./src/commit/*.js
```

Submit only when ESLint exits successfully with no reported errors. Run this
command again after changing any detector file.

### 3. 🏁 Start the server

```sh
cd src
uvicorn app:app --host="0.0.0.0" --port=10002 --no-access-log --no-server-header --proxy-headers --forwarded-allow-ips="*"

# For DEVELOPMENT:
uvicorn app:app --host="0.0.0.0" --port=10002 --no-access-log --no-server-header --proxy-headers --forwarded-allow-ips="*" --reload
```

### 4. ✅ Check server is running

Check with CLI (curl):

```sh
# Send a ping request with 'curl' to API server:
curl -s http://localhost:10002/ping
```

Check with web browser:

- Health check: <http://localhost:10002/health>
- Swagger: <http://localhost:10002/docs>
- Redoc: <http://localhost:10002/redoc>
- OpenAPI JSON: <http://localhost:10002/openapi.json>

---

## 🏗️ Build Docker Image

To build the docker image, run the following command:

```sh
docker build -t myhub/rest-ada-commit:0.0.1 .

# For MacOS (Apple Silicon) to build AMD64:
DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t myhub/rest-ada-commit:0.0.1 .
```
