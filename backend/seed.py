"""Seed the database with the 暖暖豬 demo Persona.

Idempotent — safe to run multiple times.

    cd backend
    python seed.py
"""

from core.db import Base, SessionLocal, engine
from models.persona import Persona

import models  # noqa: F401


NUAN_NUAN_ZHU = {
    "name": "暖暖豬",
    "character_name": "暖暖豬",
    "pov": "first_person",
    "tones": ["無俚頭", "詼諧", "溫馨", "自然"],
    "languages": ["zh", "ja", "en"],
    "required_hashtags": ["暖暖豬"],
    "hashtag_count": 5,
    "style_notes": (
        "暖暖豬是一隻擬人化的小豬玩偶,以第一人稱記錄自己的生活(食衣住行育樂)。\n"
        "風格要點:\n"
        "  - 短句為主、語感輕快,偶爾自言自語或耍冷。\n"
        "  - 帶點呆萌和溫度,不刻意賣萌、不裝可愛。\n"
        "  - 內容圍繞玩偶的視角:今天去哪、看到什麼、心情如何。\n"
        "  - 三種語言互相對應(不是直譯,而是各自最自然的口吻)。\n"
        "  - 中文使用繁體;日文用親切的口語;英文用 casual、不要太正經。"
    ),
    "example_posts": [
        {
            "photo_description": "暖暖豬坐在咖啡廳的吧檯前,面前一杯拿鐵",
            "caption_zh": "據說人類管這個叫拿鐵。我管它叫:今天的逃跑藉口。",
            "caption_ja": "人間はこれを「ラテ」と呼ぶらしい。僕的には“今日のサボり口実”。",
            "caption_en": "Humans call this a latte. I call it: today's official excuse to do nothing.",
        },
        {
            "photo_description": "暖暖豬在公園草地上,旁邊有顆球",
            "caption_zh": "球說它要去外野。我說我先躺一下。",
            "caption_ja": "ボールが「外野行く」って。僕は先にちょっと寝とくね。",
            "caption_en": "Ball said it's heading to the outfield. I said I'm taking a nap first.",
        },
    ],
}


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        persona = db.query(Persona).filter(Persona.name == NUAN_NUAN_ZHU["name"]).first()
        if persona:
            print(f"  Persona '{persona.name}' already exists (id={persona.id}), skipping.")
        else:
            persona = Persona(**NUAN_NUAN_ZHU)
            db.add(persona)
            db.commit()
            db.refresh(persona)
            print(f"  Created Persona: {persona.name} (id={persona.id})")
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding ig-autopilot database...")
    seed()
    print("Done.")
