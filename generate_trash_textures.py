from PIL import Image, ImageDraw, ImageFilter
import math
import random


random.seed(7)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c0, c1, t):
    return tuple(int(lerp(c0[i], c1[i], t)) for i in range(3))


def add_soft_glow(img, xy, fill, blur=12):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse(xy, fill=fill)
    glow = glow.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(glow)


def make_body_texture(path):
    w = h = 1024
    base = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    px = base.load()

    top = (111, 161, 174)
    mid = (84, 132, 145)
    bottom = (44, 74, 84)

    for y in range(h):
        v = y / (h - 1)
        if v < 0.55:
            col = lerp_color(top, mid, v / 0.55)
        else:
            col = lerp_color(mid, bottom, (v - 0.55) / 0.45)
        for x in range(w):
            u = x / (w - 1)
            cyl = 0.68 + 0.32 * math.cos((u - 0.5) * math.pi)
            stripe = 0.04 * math.sin(u * math.pi * 6.0 + 0.45)
            grime = 0.08 * (v ** 2.2)
            shade = max(0.45, min(1.25, cyl + stripe - grime))
            px[x, y] = tuple(max(0, min(255, int(c * shade))) for c in col) + (255,)

    img = base
    draw = ImageDraw.Draw(img, "RGBA")

    for i in range(16):
        x = int((i + 0.5) * w / 16)
        alpha = 18 if i % 2 == 0 else 10
        draw.rectangle((x - 1, 0, x + 1, h), fill=(255, 255, 255, alpha))

    draw.rectangle((0, 0, w, 68), fill=(255, 255, 255, 34))
    draw.rectangle((0, 74, w, 92), fill=(18, 36, 44, 86))

    draw.rectangle((0, h - 116, w, h), fill=(26, 30, 24, 65))
    draw.rectangle((0, h - 144, w, h - 132), fill=(255, 246, 214, 18))

    for _ in range(46):
        x0 = random.randint(40, w - 180)
        y0 = random.randint(120, h - 140)
        length = random.randint(38, 140)
        angle = random.uniform(-0.7, 0.7)
        x1 = int(x0 + math.cos(angle) * length)
        y1 = int(y0 + math.sin(angle) * length)
        draw.line((x0, y0, x1, y1), fill=(232, 246, 250, random.randint(25, 70)), width=random.randint(1, 3))
        draw.line((x0, y0 + 2, x1, y1 + 2), fill=(16, 28, 34, random.randint(12, 28)), width=1)

    label_x0 = 300
    label_y0 = 246
    label_x1 = 724
    label_y1 = 430
    draw.rounded_rectangle((label_x0, label_y0, label_x1, label_y1), radius=34, fill=(239, 248, 230, 232), outline=(70, 92, 74, 120), width=6)
    draw.rounded_rectangle((label_x0 + 22, label_y0 + 22, label_x1 - 22, label_y1 - 22), radius=24, outline=(255, 255, 255, 95), width=3)
    draw.rectangle((label_x0 + 108, label_y0 + 72, label_x1 - 108, label_y0 + 94), fill=(84, 147, 86, 210))
    draw.rectangle((label_x0 + 162, label_y0 + 116, label_x1 - 162, label_y0 + 138), fill=(84, 147, 86, 190))
    draw.polygon([(512, 288), (456, 336), (484, 336), (484, 378), (540, 378), (540, 336), (568, 336)], fill=(84, 147, 86, 230))

    add_soft_glow(img, (260, 80, 600, 340), (255, 255, 255, 26), blur=28)
    add_soft_glow(img, (660, 500, 900, 900), (16, 30, 36, 34), blur=36)

    img = img.convert("RGB")
    img.save(path, optimize=True)


def make_lid_texture(path):
    w = h = 1024
    img = Image.new("RGBA", (w, h), (42, 70, 78, 255))
    px = img.load()

    c = w / 2
    outer = (78, 126, 140)
    inner = (140, 194, 204)
    edge = (35, 58, 66)

    for y in range(h):
        for x in range(w):
            dx = (x - c) / c
            dy = (y - c) / c
            r = math.sqrt(dx * dx + dy * dy)
            u = x / (w - 1)
            if r < 0.82:
                col = lerp_color(inner, outer, min(1, r / 0.82))
            else:
                col = lerp_color(outer, edge, min(1, (r - 0.82) / 0.18))
            shine = 1.0 + 0.12 * math.cos((u - 0.42) * math.pi)
            px[x, y] = tuple(max(0, min(255, int(v * shine))) for v in col) + (255,)

    draw = ImageDraw.Draw(img, "RGBA")
    draw.ellipse((116, 116, 908, 908), outline=(230, 248, 252, 56), width=10)
    draw.ellipse((164, 164, 860, 860), outline=(22, 36, 42, 70), width=12)
    draw.ellipse((244, 244, 780, 780), outline=(255, 255, 255, 36), width=8)

    handle_shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(handle_shadow, "RGBA")
    shadow_draw.rounded_rectangle((426, 388, 598, 492), radius=36, fill=(0, 0, 0, 70))
    shadow_draw.ellipse((458, 334, 566, 450), fill=(0, 0, 0, 54))
    handle_shadow = handle_shadow.filter(ImageFilter.GaussianBlur(16))
    img.alpha_composite(handle_shadow)

    draw.rounded_rectangle((414, 370, 610, 474), radius=36, fill=(207, 235, 240, 230), outline=(72, 108, 118, 120), width=6)
    draw.ellipse((448, 314, 576, 442), fill=(224, 247, 250, 242), outline=(76, 110, 118, 118), width=6)
    draw.ellipse((470, 336, 554, 420), fill=(181, 220, 228, 220))
    draw.ellipse((286, 216, 446, 356), fill=(255, 255, 255, 24))
    draw.ellipse((324, 254, 430, 330), fill=(255, 255, 255, 40))

    for _ in range(20):
        x0 = random.randint(220, 804)
        y0 = random.randint(220, 804)
        x1 = x0 + random.randint(12, 52)
        y1 = y0 + random.randint(-18, 18)
        draw.line((x0, y0, x1, y1), fill=(236, 248, 250, random.randint(18, 42)), width=2)

    img = img.convert("RGB")
    img.save(path, optimize=True)


if __name__ == "__main__":
    make_body_texture("assets/textures/trash-body.png")
    make_lid_texture("assets/textures/trash-lid.png")
