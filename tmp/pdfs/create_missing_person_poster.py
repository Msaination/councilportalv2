from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf/missing-person-sipho-a5.pdf")
PAGE_WIDTH = 148 * mm
PAGE_HEIGHT = 210 * mm

RED = HexColor("#C62828")
RED_DARK = HexColor("#9F1D1D")
NAVY = HexColor("#111827")
SLATE = HexColor("#334155")
MUTED = HexColor("#64748B")
PALE_RED = HexColor("#FEF2F2")
PALE_GRAY = HexColor("#E5E7EB")
MID_GRAY = HexColor("#94A3B8")
LIGHT_GRAY = HexColor("#F8FAFC")
YELLOW = HexColor("#FBBF24")


def hex_color(value):
    return HexColor(value)


def set_fill(c, color):
    c.setFillColor(color)


def set_stroke(c, color):
    c.setStrokeColor(color)


def centered_text(c, text, x, y, font, size, color, tracking=0):
    set_fill(c, color)
    c.setFont(font, size)
    width = stringWidth(text, font, size) + tracking * max(len(text) - 1, 0)
    if tracking:
        cursor = x - width / 2
        for char in text:
            c.drawString(cursor, y, char)
            cursor += stringWidth(char, font, size) + tracking
    else:
        c.drawCentredString(x, y, text)


def left_text(c, text, x, y, font, size, color):
    set_fill(c, color)
    c.setFont(font, size)
    c.drawString(x, y, text)


def right_text(c, text, x, y, font, size, color):
    set_fill(c, color)
    c.setFont(font, size)
    c.drawRightString(x, y, text)


def wrap_text(text, font, size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def wrapped_text(c, text, x, y_top, max_width, font, size, leading, color):
    lines = wrap_text(text, font, size, max_width)
    set_fill(c, color)
    c.setFont(font, size)
    y = y_top
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_silhouette(c, cx, cy, scale=1.0):
    set_fill(c, MID_GRAY)
    c.circle(cx, cy + 23 * scale, 12 * scale, stroke=0, fill=1)
    c.roundRect(
        cx - 24 * scale,
        cy - 25 * scale,
        48 * scale,
        51 * scale,
        20 * scale,
        stroke=0,
        fill=1,
    )
    set_fill(c, white)
    c.circle(cx, cy + 23 * scale, 7.5 * scale, stroke=0, fill=1)
    c.roundRect(
        cx - 16 * scale,
        cy - 17 * scale,
        32 * scale,
        40 * scale,
        14 * scale,
        stroke=0,
        fill=1,
    )


def draw_contact_box(c, x, y, width, height, name, number):
    set_fill(c, white)
    set_stroke(c, white)
    c.setLineWidth(0.5 * mm)
    c.roundRect(x, y, width, height, 2.4 * mm, stroke=1, fill=1)
    centered_text(c, name.upper(), x + width / 2, y + height - 5.4 * mm, "Helvetica-Bold", 7.2, RED)
    centered_text(c, number, x + width / 2, y + 3.5 * mm, "Helvetica-Bold", 12.2, NAVY)


def build_poster():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_WIDTH, PAGE_HEIGHT))
    c.setTitle("Missing Person - Sipho - A5")
    c.setAuthor("Missing Person Public Appeal")
    c.setSubject("A5 missing person poster")

    set_fill(c, white)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    header_top = 210 * mm
    header_bottom = 188 * mm
    set_fill(c, RED)
    c.rect(0, header_bottom, PAGE_WIDTH, header_top - header_bottom, stroke=0, fill=1)
    centered_text(c, "URGENT PUBLIC APPEAL", PAGE_WIDTH / 2, 204.2 * mm, "Helvetica-Bold", 7.1, white, tracking=0.65)
    centered_text(c, "MISSING PERSON", PAGE_WIDTH / 2, 195.1 * mm, "Helvetica-Bold", 22.5, white, tracking=0.8)
    centered_text(c, "PLEASE HELP BRING SIPHO HOME", PAGE_WIDTH / 2, 190.3 * mm, "Helvetica-Bold", 7.3, white, tracking=0.35)

    name_top = 188 * mm
    name_bottom = 175 * mm
    set_fill(c, NAVY)
    c.rect(0, name_bottom, PAGE_WIDTH, name_top - name_bottom, stroke=0, fill=1)
    set_fill(c, YELLOW)
    c.rect(0, name_bottom, 5 * mm, name_top - name_bottom, stroke=0, fill=1)
    left_text(c, "SIPHO", 11 * mm, 179.4 * mm, "Helvetica-Bold", 19, white)
    right_text(
        c,
        "AGE 42   |   HEIGHT 1.6 m",
        139 * mm,
        181.1 * mm,
        "Helvetica-Bold",
        8.2,
        white,
    )

    photo_x = 10 * mm
    photo_y = 94 * mm
    photo_w = 128 * mm
    photo_h = 77 * mm
    set_fill(c, PALE_GRAY)
    set_stroke(c, NAVY)
    c.setLineWidth(1.1 * mm)
    c.roundRect(photo_x, photo_y, photo_w, photo_h, 3 * mm, stroke=1, fill=1)

    set_fill(c, RED)
    c.roundRect(photo_x + 5 * mm, photo_y + photo_h - 10.5 * mm, 31 * mm, 6.5 * mm, 2.4 * mm, stroke=0, fill=1)
    centered_text(c, "RECENT PHOTO", photo_x + 20.5 * mm, photo_y + photo_h - 8.7 * mm, "Helvetica-Bold", 6.6, white, tracking=0.25)

    draw_silhouette(c, PAGE_WIDTH / 2, photo_y + 36 * mm, scale=1.12)
    centered_text(c, "PHOTO TO BE INSERTED", PAGE_WIDTH / 2, photo_y + 14.5 * mm, "Helvetica-Bold", 9.4, SLATE)
    centered_text(c, "Use a clear, recent photograph of Sipho", PAGE_WIDTH / 2, photo_y + 8.7 * mm, "Helvetica", 7.1, MUTED)

    details_top = 91 * mm
    left_x = 10 * mm
    right_x = 78 * mm
    column_w = 60 * mm

    left_text(c, "LAST SEEN", left_x, 87 * mm, "Helvetica-Bold", 7.1, RED)
    left_text(c, "12 November 2026", left_x, 81.7 * mm, "Helvetica-Bold", 9.2, NAVY)

    left_text(c, "LOCATION", left_x, 74.2 * mm, "Helvetica-Bold", 7.1, RED)
    left_text(c, "Eznambeni, eMalahleni", left_x, 68.9 * mm, "Helvetica-Bold", 9.2, NAVY)

    left_text(c, "MOBILE PHONE", left_x, 61.4 * mm, "Helvetica-Bold", 7.1, RED)
    left_text(c, "Had a mobile phone", left_x, 56.1 * mm, "Helvetica-Bold", 8.7, NAVY)

    left_text(c, "CLOTHING", right_x, 87 * mm, "Helvetica-Bold", 7.1, RED)
    wrapped_text(
        c,
        "Grey T-shirt, brown pants and Scottish Converse sneakers",
        right_x,
        81.7 * mm,
        column_w,
        "Helvetica-Bold",
        8.4,
        5.6 * mm,
        NAVY,
    )

    health_top = 52 * mm
    health_bottom = 34 * mm
    set_fill(c, PALE_RED)
    c.rect(0, health_bottom, PAGE_WIDTH, health_top - health_bottom, stroke=0, fill=1)
    set_fill(c, RED)
    c.rect(0, health_bottom, 5 * mm, health_top - health_bottom, stroke=0, fill=1)
    left_text(c, "HEALTH CONDITION", 10 * mm, 47.8 * mm, "Helvetica-Bold", 7.2, RED_DARK)
    left_text(
        c,
        "May be mentally unstable - approach with care",
        10 * mm,
        40.5 * mm,
        "Helvetica-Bold",
        9.0,
        NAVY,
    )

    footer_top = 34 * mm
    set_fill(c, NAVY)
    c.rect(0, 0, PAGE_WIDTH, footer_top, stroke=0, fill=1)
    left_text(c, "CONTACT", 10 * mm, 28.7 * mm, "Helvetica-Bold", 8.4, YELLOW)
    left_text(
        c,
        "If seen, please contact immediately.",
        31.5 * mm,
        28.7 * mm,
        "Helvetica-Bold",
        7.5,
        white,
    )
    draw_contact_box(c, 10 * mm, 8 * mm, 59 * mm, 14 * mm, "Charlotte", "076 474 4777")
    draw_contact_box(c, 79 * mm, 8 * mm, 59 * mm, 14 * mm, "Busi", "083 420 2215")
    centered_text(
        c,
        "Or nearest police station / Municipal Law Enforcement",
        PAGE_WIDTH / 2,
        3.4 * mm,
        "Helvetica-Bold",
        6.9,
        white,
    )

    c.showPage()
    c.save()


if __name__ == "__main__":
    build_poster()
