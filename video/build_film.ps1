# 一键出片：提示点 → 配乐 + 音效混音 → 逐帧渲染 → 合成，成片在 out\从现在看过去_AI简史.mp4
#   .\build_film.ps1            从头出片（会先清掉旧的视频分块：分块渲染会跳过已存在的块，画面改过就必须清）
#   .\build_film.ps1 -Resume    渲染中途断了，接着上次的分块继续
# Python 优先用仓库根目录的 .venv；没有就用 PATH 里的 python
param([switch]$Resume)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py -W ignore render.py cues
Push-Location audio
& $py -W ignore build_audio.py --music
& $py -W ignore inspect_mix.py
Pop-Location
$dur = (Get-Content out\film_cues.json -Raw -Encoding UTF8 | ConvertFrom-Json).duration   # 成片时长以画面导出的为准（389 s）
$chunks = "out\chunks\film_0-$dur"
if (-not $Resume -and (Test-Path $chunks)) { Remove-Item -Recurse -Force $chunks }
& $py -W ignore render.py full --workers 4
& $py -W ignore render.py mux
