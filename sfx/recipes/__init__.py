"""音效配方注册表。

一个配方 = 一个函数 fn(seed=0, **参数) -> np.ndarray（单声道或立体声，未经母带处理）。
用 @recipe 注册后即可通过命令行渲染：python -m sfx render <名字> --seeds 0 1 2 --set 参数=值
"""
from __future__ import annotations

REGISTRY: dict[str, dict] = {}


def recipe(name: str | None = None, *, tags=(), master: dict | None = None, baseline: str | None = None):
    """注册配方。
    master：传给 master.finalize 的参数，例如环境声用 {"lufs": -20}；默认按真峰值 -1 dBTP 归一。
    baseline：对应的"朴素合成"基线配方名，试听页会并排做 A/B 对比。
    """
    def deco(fn):
        key = name or fn.__name__
        doc = (fn.__doc__ or "").strip()
        REGISTRY[key] = dict(fn=fn, title=doc.splitlines()[0] if doc else key, doc=doc,
                             tags=tuple(tags), master=master or {}, baseline=baseline)
        return fn
    return deco


MODULES = ["impacts", "doors", "weather", "fire", "footsteps", "water", "explosion", "transitions", "ui", "baselines"]


def load_all() -> dict[str, dict]:
    from importlib import import_module
    for mod in MODULES:
        try:
            import_module(f".{mod}", __name__)
        except ModuleNotFoundError as e:
            if e.name != f"{__name__}.{mod}":
                raise
    return REGISTRY
