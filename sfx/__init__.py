"""sfx：基于物理建模的程序化音效合成工具包。

模块速览：
    core      采样率、混音总线 Mix、声像、淡入淡出、慢变随机信号
    env       包络（指数衰减、分段包络）
    noise     白/粉红/布朗噪声、噪声爆发
    filters   EQ、时变滤波、模态谐振器
    modal     模态合成：材质 × 形状 × 敲击位置 × 接触时间 → 撞击声
    texture   泊松/Cox 随机事件、幂律幅度、人类节奏、气泡声
    space     房间混响（镜像声源 + 扩散尾音）、户外回声、距离
    dynamics  饱和、压缩、限幅、真峰值
    master    母带处理与导出
    analysis  分析与质检（Claude 的"耳朵"）
"""
from .core import SR, Mix, db_to_amp, fade, normalize, pan, rng, smooth_random  # noqa: F401
