"""
Builds docs/slides.pdf — a 16:9 slide deck for the Vyngo presentation.
Run: python3 docs/build_slides.py   (run from the repo root, or adjust paths)
"""
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import os

W, H = 13.333 * inch, 7.5 * inch  # 16:9

ASPHALT = (0x14/255, 0x16/255, 0x1c/255)
ASPHALT2 = (0x1b/255, 0x1e/255, 0x26/255)
LANE = (0x2b/255, 0x2f/255, 0x3a/255)
SODIUM = (1.0, 0xb0/255, 0x20/255)
PAPER = (0xee/255, 0xf0/255, 0xf4/255)
MUTED = (0x7b/255, 0x81/255, 0x90/255)
SIGNAL = (0x34/255, 0xd3/255, 0x99/255)
ALERT = (1.0, 0x54/255, 0x68/255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "slides.pdf")
DIAGRAM = os.path.join(HERE, "architecture.png")

c = canvas.Canvas(OUT, pagesize=(W, H))


def bg():
    c.setFillColorRGB(*ASPHALT)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def eyebrow(text, y=H - 0.65 * inch):
    c.setFillColorRGB(*SODIUM)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(0.7 * inch, y, text.upper())


def title(text, y=H - 1.05 * inch, size=30):
    c.setFillColorRGB(*PAPER)
    c.setFont("Helvetica-Bold", size)
    c.drawString(0.7 * inch, y, text)


def sub(text, y, size=13, color=MUTED, x=0.7 * inch):
    c.setFillColorRGB(*color)
    c.setFont("Helvetica", size)
    c.drawString(x, y, text)


def bullet(text, y, size=13.5, color=PAPER, x=0.9 * inch, dot_color=SODIUM):
    c.setFillColorRGB(*dot_color)
    c.circle(x - 0.18 * inch, y + 0.045 * inch, 0.035 * inch, fill=1, stroke=0)
    c.setFillColorRGB(*color)
    c.setFont("Helvetica", size)
    c.drawString(x, y, text)


def footer(page_label):
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(0.7 * inch, 0.4 * inch, "Vyngo Voice-Based Vehicle Search — Take-Home Submission")
    c.drawRightString(W - 0.7 * inch, 0.4 * inch, page_label)
    c.setStrokeColorRGB(*LANE)
    c.setLineWidth(0.5)
    c.line(0.7 * inch, 0.62 * inch, W - 0.7 * inch, 0.62 * inch)


def card(x, y, w, h, stroke=LANE, fill=ASPHALT2, radius=8):
    c.setFillColorRGB(*fill)
    c.setStrokeColorRGB(*stroke)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


# ---------------------------------------------------------------- Slide 1
bg()
c.setFillColorRGB(*SODIUM)
c.setFont("Helvetica-Bold", 11)
c.drawString(0.7 * inch, H - 1.4 * inch, "NH-VOICE · 01")
c.setFillColorRGB(*PAPER)
c.setFont("Helvetica-Bold", 40)
c.drawString(0.7 * inch, H - 2.0 * inch, "Vyngo Dispatch")
c.setFont("Helvetica-Bold", 22)
c.setFillColorRGB(*MUTED)
c.drawString(0.7 * inch, H - 2.55 * inch, "Voice-Based Vehicle Search — Take-Home Submission")
sub("A buyer speaks a need in English/Hinglish. We transcribe, extract slots,", H - 3.3 * inch, 14, PAPER)
sub("hard-filter a real catalog, and speak back the top 3 — grounded strictly", H - 3.58 * inch, 14, PAPER)
sub("in catalog data, with zero invented facts.", H - 3.86 * inch, 14, PAPER)
card(0.7 * inch, 1.0 * inch, W - 1.4 * inch, 1.6 * inch)
sub("Live demo:  python server.py  →  http://localhost:8000  (Chrome)", 2.15 * inch, 12.5, PAPER, x=1.0 * inch)
sub("Eval:  node eval/run_eval.js   →   16/16 pass, 0 constraint violations", 1.75 * inch, 12.5, SIGNAL, x=1.0 * inch)
sub("Repo layout: pipeline.js (shared core) · index.html (voice UI) · eval/ (harness + results)", 1.35 * inch, 11.5, MUTED, x=1.0 * inch)
footer("1 / 7")
c.showPage()

# ---------------------------------------------------------------- Slide 2: Architecture
bg()
eyebrow("Architecture")
title("Seven components, one shared pipeline")
try:
    img = ImageReader(DIAGRAM)
    iw, ih = img.getSize()
    max_w, max_h = W - 1.0 * inch, H - 2.2 * inch
    scale = min(max_w / iw, max_h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(img, (W - dw) / 2, H - 1.35 * inch - dh, width=dw, height=dh, mask='auto')
except Exception as e:
    sub(f"[diagram image not found: {e}]", H - 3 * inch)
footer("2 / 7")
c.showPage()

# ---------------------------------------------------------------- Slide 3: Anti-hallucination
bg()
eyebrow("Zero-hallucination discipline")
title("The mechanism, not a prompt")
sub("Response layer builds the spoken sentence with template literals reading", H - 1.7 * inch, 15, PAPER)
sub("fields directly off catalog record objects (r.price, r.km_driven, r.year...).", H - 1.98 * inch, 15, PAPER)
sub("There is no free-text generation step between \"matched record\" and", H - 2.26 * inch, 15, PAPER)
sub("\"spoken sentence\" — so there's no channel for an invented number to enter.", H - 2.54 * inch, 15, PAPER)

card(0.7 * inch, 2.6 * inch, (W - 1.6 * inch) / 2, 2.0 * inch, stroke=SIGNAL)
sub("What it catches", 4.35 * inch, 13, SIGNAL, x=1.0 * inch)
bullet("Every price/km/year/payload spoken", 3.95 * inch, 12.5, x=1.0*inch)
bullet("...came from catalog.csv, verifiably", 3.65 * inch, 12.5, x=1.0*inch)
bullet("Verified live by eval's constraint sweep", 3.35 * inch, 12.5, x=1.0*inch)

card(0.9 * inch + (W - 1.6 * inch) / 2, 2.6 * inch, (W - 1.6 * inch) / 2, 2.0 * inch, stroke=ALERT)
sub("What it does NOT catch", 4.35 * inch, 13, ALERT, x=1.2 * inch + (W - 1.6*inch)/2)
bullet("STT mishearing \"5 lakh\" as \"50 lakh\"", 3.95 * inch, 12.5, x=1.2*inch + (W-1.6*inch)/2)
bullet("— wrong filter applied, not a lie", 3.65 * inch, 12.5, x=1.2*inch + (W-1.6*inch)/2)
bullet("Mitigation: slots always shown on screen", 3.35 * inch, 12.5, x=1.2*inch + (W-1.6*inch)/2)
footer("3 / 7")
c.showPage()

# ---------------------------------------------------------------- Slide 4: Tradeoff 1 & 2
def tradeoff_slide(num, total, eyebrow_text, heading, decision, alternative, why, page_label):
    bg()
    eyebrow(f"Tradeoff {num} of {total}")
    title(heading, size=26)
    y = H - 1.85 * inch
    sub("DECISION", y, 11, SODIUM); y -= 0.28*inch
    sub(decision, y, 14, PAPER); y -= 0.5*inch
    sub("REJECTED ALTERNATIVE", y, 11, SODIUM); y -= 0.28*inch
    sub(alternative, y, 14, PAPER); y -= 0.5*inch
    sub("WHY", y, 11, SODIUM); y -= 0.28*inch
    for line in why:
        sub(line, y, 13, PAPER); y -= 0.26*inch
    footer(page_label)
    c.showPage()

tradeoff_slide(
    1, 3, "Understanding stage",
    "Rule-based NLU vs. LLM function-calling",
    "Regex/lexicon-based slot extraction (extractSlots()).",
    "LLM function-calling to extract budget/body-type/fuel/city/purpose.",
    [
        "Task is closed-vocabulary (5 known slot types) — LLM adds network",
        "latency + $ per turn for no real gain here.",
        "An LLM asked to extract a number can invent one — reintroduces the",
        "exact hallucination risk this assignment tests for.",
        "Cost: brittle outside the lexicon (\"compact hauler\" won't map to",
        "mini_truck without a code change).",
    ],
    "4 / 7",
)

tradeoff_slide(
    2, 3, "Pipeline shape",
    "Cascaded STT -> NLU -> TTS vs. speech-to-speech",
    "Separate STT / understanding / TTS stages, each independently inspectable.",
    "An end-to-end speech-to-speech model (lower latency, better code-switching).",
    [
        "Speech-to-speech collapses the \"slot state must be inspectable at",
        "every turn\" requirement — no transcript/slot checkpoint to debug,",
        "correct, or eval against.",
        "For a search task, correctness (never showing a 6L truck for a 5L",
        "budget) matters more than conversational naturalness.",
    ],
    "5 / 7",
)

tradeoff_slide(
    3, 3, "Voice I/O",
    "Web Speech API vs. a hosted vendor / open-source Whisper",
    "Browser-native Web Speech API for both STT and TTS.",
    "Hosted Whisper endpoint, or self-hosted Whisper-small.",
    [
        "Zero cost, zero setup, no server-side audio pipeline — fit the",
        "12-16 hour budget.",
        "Real cost: Chrome-only, needs network to Google's recognition",
        "service, Hindi/Hinglish accuracy noticeably worse than English.",
        "Would flip this at scale (see next slide) once volume justifies",
        "a vendor SLA and GPU cost.",
    ],
    "6 / 7",
)

# ---------------------------------------------------------------- Slide: Scale
bg()
eyebrow("The scale question")
title("What breaks first at 100k conversations/month", size=24)
items = [
    ("1", "Web Speech API's implicit rate limits", "Free, undocumented-SLA service. Fix: paid STT vendor with a real SLA."),
    ("2", "Single-process, in-memory conversation state", "conversationState lives in one tab/process. Fix: keyed session store (Redis)."),
    ("3", "CSV-as-database", "Linear scan is fine at 136 rows, not at real catalog scale + concurrent updates. Fix: indexed Postgres or a search engine."),
    ("4", "STT/TTS vendor concurrency caps", "Most vendors cap concurrent streams, not just monthly volume — bursts break this before compute does."),
]
y = H - 1.9 * inch
for num, head, desc in items:
    c.setFillColorRGB(*SODIUM)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.7 * inch, y, num)
    c.setFillColorRGB(*PAPER)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1.05 * inch, y, head)
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 12)
    c.drawString(1.05 * inch, y - 0.24 * inch, desc)
    y -= 0.78 * inch
sub("Not \"add more servers\" — pipeline.js is sub-millisecond per call (see eval log).", 0.95*inch, 12, SIGNAL, x=0.7*inch)
sub("Bottlenecks are all at the I/O edges: STT/TTS vendor, session state, catalog store.", 0.72*inch, 12, SIGNAL, x=0.7*inch)
footer("7 / 7")
c.showPage()

c.save()
print(f"Wrote {OUT}")
